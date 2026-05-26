// Lightweight canvas fireworks/confetti effect without external deps
// Usage: triggerFireworksAt(x, y)

type Particle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	color: string;
	life: number;
	alpha: number;
};

const COLORS = ["#ff4757", "#ffa502", "#2ed573", "#1e90ff", "#7c3aed", "#f1c40f", "#e84393"];

export function triggerFireworksAt(x: number, y: number, durationMs: number = 800) {
	const canvas = document.createElement("canvas");
	canvas.style.position = "fixed";
	canvas.style.left = "0";
	canvas.style.top = "0";
	canvas.style.pointerEvents = "none";
	canvas.style.zIndex = "9999";
	const dpr = Math.max(1, window.devicePixelRatio || 1);
	const resize = () => {
		canvas.width = Math.floor(window.innerWidth * dpr);
		canvas.height = Math.floor(window.innerHeight * dpr);
		canvas.style.width = `${window.innerWidth}px`;
		canvas.style.height = `${window.innerHeight}px`;
	};
	resize();
	document.body.appendChild(canvas);
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		document.body.removeChild(canvas);
		return;
	}
	ctx.scale(dpr, dpr);

	const originX = x;
	const originY = y;
	const particles: Particle[] = [];
	const now = performance.now();
	const end = now + durationMs;

	// Spawn initial burst
	const spawn = (count: number) => {
		for (let i = 0; i < count; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 3 + Math.random() * 4;
			const vx = Math.cos(angle) * speed;
			const vy = Math.sin(angle) * speed - 2; // small upward bias
			particles.push({
				x: originX,
				y: originY,
				vx,
				vy,
				size: 2 + Math.random() * 3,
				color: COLORS[Math.floor(Math.random() * COLORS.length)],
				life: 600 + Math.random() * 600,
				alpha: 1,
			});
		}
	};
	spawn(80);

	const gravity = 0.06;
	const air = 0.995;

	function draw(_ts: number) {
		if (!ctx) return;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		// update & render particles
		for (let i = particles.length - 1; i >= 0; i--) {
			const p = particles[i];
			p.vx *= air;
			p.vy = p.vy * air + gravity;
			p.x += p.vx;
			p.y += p.vy;
			p.life -= 16;
			p.alpha = Math.max(0, Math.min(1, p.life / 800));
			if (p.life <= 0) {
				particles.splice(i, 1);
				continue;
			}
			ctx.globalAlpha = p.alpha;
			ctx.fillStyle = p.color;
			ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
		}

		if (performance.now() < end || particles.length > 0) {
			requestAnimationFrame(draw);
		} else {
			document.body.removeChild(canvas);
		}
	}

	requestAnimationFrame(draw);
}

export function triggerFireworksForElement(el: HTMLElement) {
	const rect = el.getBoundingClientRect();
	const cx = rect.left + rect.width / 2;
	const cy = rect.top + rect.height / 2;
	triggerFireworksAt(cx, cy);
}
