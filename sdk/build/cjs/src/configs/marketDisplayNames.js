"use strict";
// Custom Market Display Names Configuration
// 
// This file allows you to customize how market names are displayed in the UI.
// 
// Format: "token_address": "custom_display_name"
// 
// Examples:
// - "0x8341530234CE887A974155c9107b6321632eb854": "PUBG"  // Apple token displays as PUBG
// - "0x1234567890123456789012345678901234567890": "CUSTOM" // Another token displays as CUSTOM
// 
// To add a new mapping:
// 1. Find the token address you want to customize
// 2. Add a new line: "token_address": "desired_display_name"
// 3. Save the file
// 
// The system will automatically use these custom names throughout the interface.
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUSTOM_MARKET_NAMES = void 0;
exports.CUSTOM_MARKET_NAMES = {
    // Apple token - displays as PUBG
    "0x8341530234CE887A974155c9107b6321632eb854": "PUBG",
    "0x0b6620E87d914114cd518B66Ce2103370efE9558": "The Weeknd",
    "0xe0Ac26638013932FfDE447E8ab692f9e24a1219F": "Taylor Swift",
    "0xE1f5680328E305Ea78f1a306f02ba12Ff0f10AcE": "Coldplay",
    "0xF8F66Dc1F98c4E77FC0c7c97fac59E0322d75d1c": "Planes",
    "0xc343a7f2A10CfE947773f5628AdD86C86A4281A5": "Chainsmokers",
    // Add more custom market names below:
    // "0x...": "Custom Name",
    // Example mappings (uncomment and modify as needed):
    // "0x1234567890123456789012345678901234567890": "EXAMPLE",
    // "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd": "TEST",
};
