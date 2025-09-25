import { ethers, BrowserProvider, Wallet, Contract, formatUnits, parseUnits, id, ZeroAddress } from 'ethers';
import { usePrivy, useWallets as usePrivyWallets } from '@privy-io/react-auth';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';

// Contract addresses on Base
const CONTRACTS = {
  CTF: '0xd51B2c739eE5Fe24Bd7d958C1EaE65572183530f',
  EXCHANGE: '0xADd35f4af0422c59FCdf526a370fd3451604aCE4',
  COLLATERAL: '0x333C89b2857FA0EE8d9Bcb7328C8672A45637C65', // TestUSDC
};

const BASE_RPC = 'https://api.developer.coinbase.com/rpc/v1/base/WMQ4Y6b5ZsqmO9MTCfyjZG2aQXG5T1Ih';

// Alice's private key and address
const ALICE_PRIVATE_KEY = '';
const ALICE_ADDRESS = '0xF43Ff950d594D772287848209d6e1903b24f22e2';

// Market token IDs from your registry
const marketYesTokenId = '28528835116769797062138760014212417242154508519374627770620461121124362757976';
const marketNoTokenId = '8480244017631729635921735082889759115838957586437095630423656444620223226490';

export interface FatTestResult {
  success: boolean;
  error?: string;
  aliceBalances?: {
    usdc: string;
    yes: string;
    no: string;
  };
  bobBalances?: {
    usdc: string;
    yes: string;
    no: string;
  };
  transactionHash?: string;
}

// React hook to run the fat test with Privy integration
export function useFatTestMintTrading() {
  const { authenticated, user } = usePrivy();
  const { wallets: privyWallets } = usePrivyWallets();
  const { client: smartClient, getClientForChain } = useSmartWallets();
  
  const runFatTest = async (): Promise<FatTestResult> => {
    if (!authenticated || !privyWallets || privyWallets.length === 0) {
      throw new Error('Bob\'s Privy wallet not authenticated');
    }
    
    console.log('🔍 Available Privy wallets:', privyWallets);
    console.log('🔍 Wallet details:', privyWallets.map((w: any) => ({
      type: w.type,
      walletClientType: w.walletClientType,
      connectorType: w.connectorType,
      address: w.address
    })));
    
    // Get smart wallet address from user's linked accounts
    const smartWalletAddress = (user?.linkedAccounts || [])
      // @ts-ignore
      .find((acct) => acct?.type === "smart_wallet")?.address as string | undefined;
    
    if (!smartWalletAddress) {
      throw new Error('Bob\'s smart wallet not found in linked accounts');
    }
    
    console.log('🔐 Bob\'s smart wallet address:', smartWalletAddress);
    
    // Try different ways to find the embedded wallet (same approach as TradeExecutionService)
    let embeddedWallet = privyWallets.find((w: any) => w.type === "embedded_wallet");
    
    if (!embeddedWallet) {
      // Try finding by wallet type or other properties
      embeddedWallet = privyWallets.find((w: any) => 
        w.walletClientType === "privy" || 
        w.connectorType === "privy" ||
        w.type === "privy"
      );
    }
    
    if (!embeddedWallet) {
      // If still not found, use the first available wallet
      embeddedWallet = privyWallets[0];
    }
    
    if (!embeddedWallet) {
      throw new Error('Bob\'s embedded wallet not found');
    }
    
    console.log('🔐 Found embedded wallet:', embeddedWallet);
    
    // Get Ethereum provider from Bob's wallet
    const eip1193Provider = await embeddedWallet.getEthereumProvider();
    const provider = new BrowserProvider(eip1193Provider);
    const bobWallet = await provider.getSigner();
    
    console.log('🟧 Bob (NO Buyer) - Embedded wallet:', bobWallet.address);
    console.log('🟧 Bob (NO Buyer) - Smart wallet:', smartWalletAddress);
    
    // Now run the fat test with Bob's wallet, smart wallet address, and smart client
    return await runFatTestWithBobWallet(bobWallet, smartWalletAddress, smartClient, getClientForChain);
  };
  
  return { runFatTest, isAuthenticated: authenticated };
}

// Main fat test function that accepts Bob's wallet, smart wallet address, and smart client
async function runFatTestWithBobWallet(
  bobWallet: any, 
  bobSmartWalletAddress: string, 
  smartClient: any, 
  getClientForChain: any
): Promise<FatTestResult> {
  console.log('🌱 Fat Test Mint Trade - Alice BUY YES vs Bob BUY NO\n');
  
  try {
    // Helper: extract revert data and decode via known selectors
    const extractRevertData = (err: any): string | undefined => {
      const candidates = [
        err?.data,
        err?.error?.data,
        err?.info?.error?.data,
        err?.reason,
        err?.shortMessage,
        err?.value,
      ];
      for (const c of candidates) {
        if (typeof c === 'string' && c.startsWith('0x') && c.length >= 10) return c;
      }
      try {
        const json = JSON.stringify(err);
        const match = json.match(/0x[a-fA-F0-9]{8,}/);
        if (match) return match[0];
      } catch {}
      return undefined;
    };

    const selectorToErrorName: Record<string, string> = {
      '0x30cd7471': 'NotOwner',
      '0x5211a079': 'NotTaker',
      '0x7b38b76e': 'OrderFilledOrCancelled',
      '0xc56873ba': 'OrderExpired',
      '0x756688fe': 'InvalidNonce',
      '0xe2cc6ad6': 'MakingGtRemaining',
      '0x7f9a6f46': 'NotCrossing',
      '0xdf4d8080': 'TooLittleTokensReceived',
      '0xa0b94465': 'MismatchedTokenIds',
      '0x8baa579f': 'InvalidSignature',
      '0x66f8620a': 'InvalidComplement',
      '0x3f6cc768': 'InvalidTokenId',
      '0x3a81d6fc': 'AlreadyRegistered',
      '0x9e87fac8': 'Paused',
      '0xcd4e6167': 'FeeTooHigh',
      '0x7bfa4b9f': 'NotAdmin',
      '0x7c214f04': 'NotOperator',
      '0x5fc483c5': 'OnlyOwner',
      '0x7d7b71b5': 'OnlyAuthorized',
    };

    const decodeKnownError = (err: any) => {
      const data = extractRevertData(err);
      if (!data || data.length < 10) return { selector: undefined, name: undefined };
      const selector = data.slice(0, 10).toLowerCase();
      const name = selectorToErrorName[selector];
      return { selector, name };
    };

    // Set up Alice's wallet (local wallet)
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const alice = new Wallet(ALICE_PRIVATE_KEY, provider);
    
    console.log('🟦 Alice (YES Buyer):', alice.address);
    console.log('🟧 Bob (NO Buyer) - Embedded wallet:', bobWallet.address);
    console.log('🟧 Bob (NO Buyer) - Smart wallet:', bobSmartWalletAddress);
    
    // Exchange contract ABIs
    const exchangeAbi = [
      'function matchOrders((uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes) takerOrder, (uint256,address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bytes)[] makerOrders, uint256 takerFillAmount, uint256[] makerFillAmounts)',
      'function nonces(address) view returns (uint256)',
      'function isOperator(address) view returns (bool)'
    ];
    
    const usdcAbi = [
      'function transfer(address to, uint256 amount) returns (bool)',
      'function approve(address spender, uint256 amount) returns (bool)',
      'function balanceOf(address account) view returns (uint256)',
      'function allowance(address owner, address spender) view returns (uint256)'
    ];
    
    const ctfAbi = [
      'function balanceOf(address account, uint256 id) view returns (uint256)'
    ];
    
    const exchange = new Contract(CONTRACTS.EXCHANGE, exchangeAbi, alice);
    const usdc = new Contract(CONTRACTS.COLLATERAL, usdcAbi, alice);
    const ctf = new Contract(CONTRACTS.CTF, ctfAbi, alice);
    
    // Check operator status
    const isAliceOperator = await exchange.isOperator(alice.address);
    console.log('\n🔑 Alice is operator:', isAliceOperator);
    
    if (!isAliceOperator) {
      throw new Error('Alice needs to be an operator to call matchOrders');
    }
    
    // Check balances before trade
    console.log('\n💰 Initial Balances:');
    const aliceUsdc = await usdc.balanceOf(alice.address);
    const bobUsdc = await usdc.balanceOf(bobSmartWalletAddress); // Check smart wallet balance
    const aliceYes = await ctf.balanceOf(alice.address, marketYesTokenId);
    const bobYes = await ctf.balanceOf(bobSmartWalletAddress, marketYesTokenId);
    const aliceNo = await ctf.balanceOf(alice.address, marketNoTokenId);
    const bobNo = await ctf.balanceOf(bobSmartWalletAddress, marketNoTokenId);
    
    console.log(`  Alice USDC: ${formatUnits(aliceUsdc, 6)}`);
    console.log(`  Bob USDC: ${formatUnits(bobUsdc, 6)}`);
    console.log(`  Alice YES: ${formatUnits(aliceYes, 6)}`);
    console.log(`  Bob YES: ${formatUnits(bobYes, 6)}`);
    console.log(`  Alice NO: ${formatUnits(aliceNo, 6)}`);
    console.log(`  Bob NO: ${formatUnits(bobNo, 6)}`);
    
    // Ensure Bob has enough USDC for his order
    if (bobUsdc < parseUnits('50', 6)) {
      console.log('\n💸 Transferring more USDC from Alice to Bob...');
      const transferTx = await usdc.transfer(bobSmartWalletAddress, parseUnits('50', 6));
      await transferTx.wait();
      console.log('✅ Transferred 50 USDC to Bob');
    }
    
    // Set up approvals for both wallets
    console.log('\n🔓 Setting up approvals...');
    
    // Alice approvals (she'll buy YES with USDC)
    const aliceUsdcApproval = await usdc.approve(CONTRACTS.EXCHANGE, parseUnits('1000', 6));
    await aliceUsdcApproval.wait();
    
    // Bob approvals (he'll buy NO with USDC) - using smart wallet client to send transaction
    console.log('🔓 Setting up Bob\'s USDC approval using smart wallet...');
    
    // Get smart wallet client for Base chain
    const smartWalletClient = await getClientForChain({ id: 8453 }); // Base chain ID
    if (!smartWalletClient) {
      throw new Error('No smart wallet client available for Base chain');
    }
    
    // Create approval transaction data
    const usdcInterface = new ethers.Interface(usdcAbi);
    const approvalData = usdcInterface.encodeFunctionData('approve', [
      CONTRACTS.EXCHANGE,
      parseUnits('1000', 6)
    ]);
    
    // Send approval transaction through smart wallet
    const approvalTxHash = await smartWalletClient.sendTransaction({
      to: CONTRACTS.COLLATERAL as `0x${string}`,
      data: approvalData as `0x${string}`,
      value: 0n
    });
    
    console.log('✅ Bob\'s USDC approval transaction sent:', approvalTxHash);
    
    // Wait for approval transaction to be mined
    console.log('⏳ Waiting for Bob\'s approval transaction to be mined...');
    try {
      // Wait for the transaction to be mined
      const approvalTx = await provider.getTransaction(approvalTxHash);
      if (approvalTx) {
        await approvalTx.wait();
        console.log('✅ Bob\'s USDC approval transaction confirmed');
      } else {
        console.log('⚠️ Could not fetch approval transaction, waiting 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (waitError) {
      console.log('⚠️ Error waiting for approval transaction, waiting 5 seconds...', waitError);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Verify Bob's USDC approval
    console.log('🔍 Verifying Bob\'s USDC approval...');
    const bobUsdcAllowance = await usdc.allowance(bobSmartWalletAddress, CONTRACTS.EXCHANGE);
    console.log(`Bob's USDC allowance: ${formatUnits(bobUsdcAllowance, 6)}`);
    
    if (bobUsdcAllowance < parseUnits('50', 6)) {
      throw new Error(`Bob's USDC approval insufficient: ${formatUnits(bobUsdcAllowance, 6)} < 50`);
    }
    
    console.log('✅ All approvals set and verified');
    
    // Set nonces from the Exchange - fetch on chain nonces
    console.log('\n🔢 Fetching on-chain nonces...');
    const aliceNonceOnChain = await exchange.nonces(alice.address);
    const bobNonceOnChain = await exchange.nonces(bobSmartWalletAddress);
    
    console.log(`  Alice nonce: ${aliceNonceOnChain}`);
    console.log(`  Bob nonce: ${bobNonceOnChain}`);
    
    // Check if nonces are valid (should be >= 0)
    if (aliceNonceOnChain < 0 || bobNonceOnChain < 0) {
      throw new Error(`Invalid nonces: Alice=${aliceNonceOnChain}, Bob=${bobNonceOnChain}`);
    }
    
    // Create the mint trade orders
    const domain = {
      name: 'Polymarket CTF Exchange',
      version: '1',
      chainId: 8453,
      verifyingContract: CONTRACTS.EXCHANGE
    };
    
    const orderTypes = {
      Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'signer', type: 'address' },
        { name: 'taker', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'makerAmount', type: 'uint256' },
        { name: 'takerAmount', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'feeRateBps', type: 'uint256' },
        { name: 'side', type: 'uint8' },
        { name: 'signatureType', type: 'uint8' }
      ]
    };

    const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    
    // Alice wants to BUY 50 YES tokens at $0.35 each = $17.50 total
    const aliceOrder: any = {
      salt: id('alice-buy-yes-mint'),
      maker: alice.address,
      signer: alice.address,
      taker: ZeroAddress, // Public order
      tokenId: marketYesTokenId,
      makerAmount: parseUnits('17.5', 6),  // Alice provides $17.50 USDC
      takerAmount: parseUnits('50', 6), // Alice wants 50 YES tokens
      expiration,
      nonce: aliceNonceOnChain, // Set from on-chain nonce
      feeRateBps: 0,
      side: 0, // BUY
      signatureType: 0
    };
    
    // Bob wants to BUY 50 NO tokens at $0.65 each = $32.50 total
    const bobOrder: any = {
      salt: id('bob-buy-no-mint'),
      maker: bobSmartWalletAddress, // Smart wallet address
      signer: bobWallet.address, // Embedded wallet address
      taker: ZeroAddress, // Public order
      tokenId: marketNoTokenId,
      makerAmount: parseUnits('32.5', 6), // Bob provides $32.50 USDC
      takerAmount: parseUnits('50', 6),   // Bob wants 50 NO tokens
      expiration,
      nonce: bobNonceOnChain, // Set from on-chain nonce
      feeRateBps: 0,
      side: 0, // BUY (Bob is buying NO tokens)
      signatureType: 3 // Signature type 3 for Privy
    };
    
    // ABI for the wallet helpers we need
    const walletAbi = [
      "function isOwnerAddress(address) view returns (bool)",
      "function addOwnerAddress(address owner)",
      "function isValidSignature(bytes32,bytes) view returns (bytes4)"
    ];

    const wallet = new Contract(bobSmartWalletAddress, walletAbi, provider);

    // A) ensure the embedded EOA is an owner for 1271 checks
    console.log('\n🔍 Checking Bob\'s smart wallet ownership...');
    const isOwner = await wallet.isOwnerAddress(bobWallet.address);
    console.log(`Is Bob's embedded EOA (${bobWallet.address}) an owner? ${isOwner}`);
    
    if (!isOwner) {
      console.log('➕ Adding Bob\'s embedded EOA as owner on smart wallet...');
      // add your embedded EOA as an owner on the smart wallet
      // this tx must be sent through the Coinbase smart wallet client
      const dataAdd = new ethers.Interface(walletAbi).encodeFunctionData(
        "addOwnerAddress",
        [bobWallet.address]
      );
      const addTxHash = await smartWalletClient.sendTransaction({
        to: bobSmartWalletAddress as `0x${string}`,
        data: dataAdd as `0x${string}`,
        value: 0n
      });
      console.log("✅ Owner add tx:", addTxHash);
      await provider.waitForTransaction(addTxHash);
      console.log('✅ Bob\'s embedded EOA added as owner');
    } else {
      console.log('✅ Bob\'s embedded EOA is already an owner');
    }

    // Sign the orders with respective wallets
    console.log('\n✍️  Signing orders...');
    console.log('🔍 Alice signing with domain:', domain);
    console.log('🔍 Alice signing with order:', aliceOrder);
    const aliceSignature = await alice.signTypedData(domain, orderTypes, aliceOrder);
    console.log('✅ Alice signature:', aliceSignature);
    
    console.log('🔍 Bob signing with domain:', domain);
    console.log('🔍 Bob signing with order:', bobOrder);
    
    // B) sign the order now that ownership is in place
    const bobSignature = await bobWallet.signTypedData(domain, orderTypes, bobOrder);
    console.log('✅ Bob signature:', bobSignature);

    // C) Local ECDSA preflight (cheap & deterministic)
    console.log('\n🔍 Running local ECDSA preflight check...');
    const recovered = ethers.verifyTypedData(domain, orderTypes, bobOrder, bobSignature);
    console.log(`Recovered address: ${recovered}, Expected: ${bobWallet.address}`);
    
    if (recovered.toLowerCase() !== bobWallet.address.toLowerCase()) {
      throw new Error(`Local ECDSA check failed: recovered=${recovered}, expected signer=${bobWallet.address}`);
    }
    console.log('✅ Local ECDSA preflight passed - signature is valid');

    // Attach signatures to orders
    aliceOrder.signature = aliceSignature;
    bobOrder.signature = bobSignature;
    
    console.log('📝 Alice (BUY YES): 50 YES tokens @ $0.35 = $17.50 total');
    console.log('📝 Bob (BUY NO): 50 NO tokens @ $0.65 = $32.50 total');
    console.log('💡 Prices add up to $1.00 → Valid for minting!');
    console.log('🌱 Expected outcome: Mint 50 complete sets, give Alice 50 YES, give Bob 50 NO');
    
    // Convert to tuple format for Solidity
    const aliceOrderTuple = [
      aliceOrder.salt,
      aliceOrder.maker,
      aliceOrder.signer,
      aliceOrder.taker,
      aliceOrder.tokenId,
      aliceOrder.makerAmount,
      aliceOrder.takerAmount,
      aliceOrder.expiration,
      aliceOrder.nonce,
      aliceOrder.feeRateBps,
      aliceOrder.side,
      aliceOrder.signatureType,
      aliceOrder.signature
    ];
    
    const bobOrderTuple = [
      bobOrder.salt,
      bobOrder.maker,
      bobOrder.signer,
      bobOrder.taker,
      bobOrder.tokenId,
      bobOrder.makerAmount,
      bobOrder.takerAmount,
      bobOrder.expiration,
      bobOrder.nonce,
      bobOrder.feeRateBps,
      bobOrder.side,
      bobOrder.signatureType,
      bobOrder.signature
    ];

    console.log("alice tuple", aliceOrderTuple);
    console.log("bob tuple", bobOrderTuple);
    
    // Display readable maker and taker amounts
    console.log('\n📊 Order Details:');
    console.log('🟦 Alice (BUY YES):');
    console.log(`  Maker Amount: $${formatUnits(aliceOrder.makerAmount, 6)} USDC (what Alice provides)`);
    console.log(`  Taker Amount: ${formatUnits(aliceOrder.takerAmount, 6)} YES tokens (what Alice wants)`);
    
    console.log('🟧 Bob (BUY NO):');
    console.log(`  Maker Amount: $${formatUnits(bobOrder.makerAmount, 6)} USDC (what Bob provides)`);
    console.log(`  Taker Amount: ${formatUnits(bobOrder.takerAmount, 6)} NO tokens (what Bob wants)`);
    
    // Calculate fill amounts
    const takerFillAmount = parseUnits('17.5', 6); // Alice pays $17.50 (50 × $0.35)
    const makerFillAmounts = [parseUnits('32.5', 6)]; // Bob pays $32.50 (full order)
    
    // Additional debugging - check if Alice has enough USDC
    console.log('\n🔍 Pre-transaction Balance Check:');
    const aliceUsdcBalance = await usdc.balanceOf(alice.address);
    const bobUsdcBalance = await usdc.balanceOf(bobSmartWalletAddress);
    console.log(`  Alice USDC Balance: ${formatUnits(aliceUsdcBalance, 6)}`);
    console.log(`  Bob USDC Balance: ${formatUnits(bobUsdcBalance, 6)}`);
    console.log(`  Alice needs: ${formatUnits(takerFillAmount, 6)} USDC`);
    console.log(`  Bob needs: ${formatUnits(makerFillAmounts[0], 6)} USDC`);
    
    if (aliceUsdcBalance < takerFillAmount) {
      throw new Error(`Alice insufficient USDC: has ${formatUnits(aliceUsdcBalance, 6)}, needs ${formatUnits(takerFillAmount, 6)}`);
    }
    if (bobUsdcBalance < makerFillAmounts[0]) {
      throw new Error(`Bob insufficient USDC: has ${formatUnits(bobUsdcBalance, 6)}, needs ${formatUnits(makerFillAmounts[0], 6)}`);
    }
    
    // Execute the mint match
    console.log('\n⚡ Executing mint matchOrders...');
    
    // First, try to simulate the transaction to see if it would succeed
    console.log('🔍 Simulating matchOrders transaction...');
    try {
      await exchange.matchOrders.staticCall(
        aliceOrderTuple,     // taker order (Alice BUY YES)
        [bobOrderTuple],     // maker orders (Bob BUY NO)
        takerFillAmount,     // Alice's contribution to the mint
        makerFillAmounts     // Bob's contribution to the mint
      );
      console.log('✅ Simulation successful - transaction should work');
    } catch (simError: any) {
      const { selector, name } = decodeKnownError(simError);
      console.error('❌ Simulation failed:', simError?.message || simError);
      if (selector) {
        console.error('🔎 Revert selector:', selector, name ? `(= ${name})` : '');
      }
      throw new Error(`Transaction simulation failed: ${simError?.message || 'Unknown error'}${name ? ` [${name}]` : ''}`);
    }
    
    // If simulation passes, execute the actual transaction
    console.log('🚀 Executing actual matchOrders transaction...');
    let tx;
    try {
      tx = await exchange.matchOrders(
        aliceOrderTuple,     // taker order (Alice BUY YES)
        [bobOrderTuple],     // maker orders (Bob BUY NO)
        takerFillAmount,     // Alice's contribution to the mint
        makerFillAmounts     // Bob's contribution to the mint
      );
    } catch (sendError: any) {
      const { selector, name } = decodeKnownError(sendError);
      console.error('❌ Send failed:', sendError?.message || sendError);
      if (selector) {
        console.error('🔎 Revert selector:', selector, name ? `(= ${name})` : '');
      }
      throw sendError;
    }
    
    console.log('⏳ Mint TX:', tx.hash);
    await tx.wait();
    console.log('✅ Mint trade executed successfully!');
    
    // Check final balances
    console.log('\n💰 Final Balances:');
    const aliceUsdcFinal = await usdc.balanceOf(alice.address);
    const bobUsdcFinal = await usdc.balanceOf(bobSmartWalletAddress);
    const aliceYesFinal = await ctf.balanceOf(alice.address, marketYesTokenId);
    const bobYesFinal = await ctf.balanceOf(bobSmartWalletAddress, marketYesTokenId);
    const aliceNoFinal = await ctf.balanceOf(alice.address, marketNoTokenId);
    const bobNoFinal = await ctf.balanceOf(bobSmartWalletAddress, marketNoTokenId);
    
    console.log(`  Alice USDC: ${formatUnits(aliceUsdcFinal, 6)} (was ${formatUnits(aliceUsdc, 6)})`);
    console.log(`  Bob USDC: ${formatUnits(bobUsdcFinal, 6)} (was ${formatUnits(bobUsdc, 6)})`);
    console.log(`  Alice YES: ${formatUnits(aliceYesFinal, 6)} (was ${formatUnits(aliceYes, 6)})`);
    console.log(`  Bob YES: ${formatUnits(bobYesFinal, 6)} (was ${formatUnits(bobYes, 6)})`);
    console.log(`  Alice NO: ${formatUnits(aliceNoFinal, 6)} (was ${formatUnits(aliceNo, 6)})`);
    console.log(`  Bob NO: ${formatUnits(bobNoFinal, 6)} (was ${formatUnits(bobNo, 6)})`);
    
    console.log('\n🎉 SUCCESS! Mint trade worked perfectly!');
    console.log('🌱 New shares were minted from collateral');
    console.log(`💡 Alice paid $${formatUnits(takerFillAmount, 6)} and received ${formatUnits(parseUnits('50', 6), 6)} YES tokens`);
    console.log(`💡 Bob paid $${formatUnits(makerFillAmounts[0], 6)} and received ${formatUnits(parseUnits('50', 6), 6)} NO tokens`);
    console.log('📊 Alice now has 50 YES tokens from her minted order');
    
    return {
      success: true,
      transactionHash: tx.hash,
      aliceBalances: {
        usdc: formatUnits(aliceUsdcFinal, 6),
        yes: formatUnits(aliceYesFinal, 6),
        no: formatUnits(aliceNoFinal, 6)
      },
      bobBalances: {
        usdc: formatUnits(bobUsdcFinal, 6),
        yes: formatUnits(bobYesFinal, 6),
        no: formatUnits(bobNoFinal, 6)
      }
    };
    
  } catch (error: any) {
    console.error('❌ Fat test failed:', error?.message || error);
    const { selector, name } = decodeKnownError(error);
    if (selector) {
      console.error('🔎 Revert selector:', selector, name ? `(= ${name})` : '');
    }
    if (name === 'InvalidNonce') {
      console.log('🤔 InvalidNonce error - this should not happen with mint trades');
    }
    
    return {
      success: false,
      error: `${error?.message || 'Unknown error'}${name ? ` [${name}]` : ''}`
    };
  }
}