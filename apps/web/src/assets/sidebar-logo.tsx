import Image from 'next/image';

type TSidebarLogoProps = {
  logo?: {
    src: string;
    alt: string;
    title?: string;
    className?: string;
  };
  collapsed?: boolean;
};

export function SidebarLogo({ logo, collapsed }: TSidebarLogoProps) {
  if (!logo) return null;

  return (
    <div className="flex items-center gap-2">
      {logo.src && (
        <Image
          src={logo.src}
          width={64}
          height={64}
          alt={logo.alt || 'Logo'}
          className={logo.className}
        />
      )}
      {!collapsed && logo.title && (
        <span className="font-semibold text-sidebar-primary truncate">{logo.title}</span>
      )}
    </div>
  );
}
