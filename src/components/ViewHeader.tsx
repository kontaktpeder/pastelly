import { ReactNode, CSSProperties, forwardRef } from 'react';

interface ViewHeaderProps {
  variant: 'calendar' | 'list';
  onPrev: () => void;
  onNext: () => void;
  onTitleClick?: () => void;
  children: ReactNode;
  subtitle?: string;
  calendarStyle?: CSSProperties;
}

const ViewHeader = forwardRef<HTMLDivElement, ViewHeaderProps>(
  ({ variant, onPrev, onNext, onTitleClick, children, subtitle, calendarStyle }, ref) => {
    const isCalendar = variant === 'calendar';

    const bg = isCalendar ? '' : 'bg-list-accent';
    const textColor = isCalendar ? 'text-current' : 'text-foreground';
    const arrowColor = 'stroke-current';
    const hoverBg = isCalendar ? 'hover:bg-black/10' : 'hover:bg-white/40';

    return (
      <div
        ref={ref}
        className={`${bg} rounded-b-3xl`}
        style={isCalendar ? calendarStyle : undefined}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <button type="button" onClick={onPrev} aria-label="Forrige" className={`w-11 h-11 flex items-center justify-center rounded-full ${hoverBg}`}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 15L7 10L12 5" className={arrowColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button type="button" onClick={onTitleClick} className="min-h-11 px-2 text-center" disabled={!onTitleClick}>
            <h2 className={`${isCalendar ? 'text-2xl' : 'text-xl'} font-bold capitalize ${textColor}`}>
              {children}
            </h2>
            {subtitle && (
              <p className={`text-sm mt-0.5 ${isCalendar ? 'text-current/70' : 'text-muted-foreground'}`}>
                {subtitle}
              </p>
            )}
          </button>
          <button type="button" onClick={onNext} aria-label="Neste" className={`w-11 h-11 flex items-center justify-center rounded-full ${hoverBg}`}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M8 5L13 10L8 15" className={arrowColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    );
  }
);

ViewHeader.displayName = 'ViewHeader';

export default ViewHeader;
