const TextSeparator = ({ title }: { title: string }) => {
  return (
    <div className="relative flex flex-row items-center gap-1">
      <div className="w-full h-[1px] bg-border"></div>
      <div className="text-xs text-muted-foreground text-center min-w-max">{title}</div>
      <div className="w-full h-[1px] bg-border"></div>
    </div>
  );
};

export default TextSeparator;
