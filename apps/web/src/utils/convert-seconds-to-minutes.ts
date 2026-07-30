const convertSecondsToMinutes = (duration: number) => {
  const minutes = Math.floor(duration / 60)
    .toFixed(0)
    .toString()
    .padStart(2, '0');

  const seconds = (duration % 60).toFixed(0).toString().padStart(2, '0');

  return `${minutes}:${seconds}`;
};

export default convertSecondsToMinutes;
