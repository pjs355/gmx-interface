// Simplified SettingsModal for LevelUp Predictions
interface SettingsModalProps {
  isSettingsVisible: boolean;
  setIsSettingsVisible: (visible: boolean) => void;
}

export function SettingsModal({ isSettingsVisible, setIsSettingsVisible }: SettingsModalProps) {
  if (!isSettingsVisible) return null;

  return (
    <div className="modal-backdrop" onClick={() => setIsSettingsVisible(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p>Settings panel - to be implemented</p>
        <button onClick={() => setIsSettingsVisible(false)}>Close</button>
      </div>
    </div>
  );
}
