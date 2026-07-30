export const formatRelativeTime = (dateString: string): string => {
  const now = new Date();
  const asNum = Number(dateString);
  const date = !isNaN(asNum) && String(asNum) === dateString
    ? new Date(asNum * 1000)
    : new Date(dateString);
  // internal milliseconds value of getTime() is independent of user timezone
  const diffInMilliseconds = now.getTime() - date.getTime();

  // Convert to different time units
  const diffInMinutes = Math.floor(diffInMilliseconds / (1000 * 60));
  const diffInHours = Math.floor(diffInMilliseconds / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));
  const diffInWeeks = Math.floor(diffInDays / 7);
  const diffInMonths = Math.floor(diffInDays / 30);
  const diffInYears = Math.floor(diffInDays / 365);

  // Return appropriate relative time
  if (diffInMinutes < 1) {
    return 'Just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  } else if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  } else if (diffInWeeks < 4) {
    return `${diffInWeeks}w ago`;
  } else if (diffInMonths < 12) {
    return `${diffInMonths}mo ago`;
  } else {
    return `${diffInYears}y ago`;
  }
};

export const getDateGroupLabel = (formattedDate: string): 'Today' | 'Yesterday' | null => {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: '2-digit', timeZone: userTimezone };
  const today = new Date().toLocaleDateString('en-GB', opts);
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-GB', opts);
  if (formattedDate === today) return 'Today';
  if (formattedDate === yesterday) return 'Yesterday';
  return null;
};

export const formatDate = (dateString: string) => {
  const asNum = Number(dateString);
  // If the value is a pure number (epoch), treat as seconds and convert to ms
  const originalDate = !isNaN(asNum) && String(asNum) === dateString
    ? new Date(asNum * 1000)
    : new Date(dateString);
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

  // Format date as "DD MMM 'YY"
  const formattedDate = originalDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    timeZone: userTimezone,
  });

  // Format time as "H:MM AM/PM"
  const formattedTime = originalDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: userTimezone,
  });

  const relativeTime = formatRelativeTime(dateString);

  return {
    date: formattedDate,
    time: formattedTime,
    relativeTime,
  };
};
