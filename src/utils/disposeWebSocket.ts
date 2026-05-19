/**
 * Tear down a WebSocket without Chrome's "closed before the connection is established"
 * warning when React Strict Mode unmounts during CONNECTING.
 */
export function disposeWebSocket(socket: WebSocket): void {
	socket.onopen = null;
	socket.onmessage = null;
	socket.onerror = null;
	socket.onclose = null;

	if (socket.readyState === WebSocket.OPEN) {
		socket.close();
		return;
	}
	if (socket.readyState === WebSocket.CONNECTING) {
		socket.addEventListener("open", () => socket.close(), { once: true });
	}
}
