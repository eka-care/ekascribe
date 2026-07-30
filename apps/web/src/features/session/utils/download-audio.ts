const downloadAudio = (audioUrl: string, sessionUuid: string) => {
  if (audioUrl) {
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = `recording_${sessionUuid || 'untitled'}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
export default downloadAudio;
