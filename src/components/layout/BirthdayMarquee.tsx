import { useCallback, useEffect, useMemo, useState } from "react";
import { Cake, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { todaysBirthdays } from "@/lib/birthdays";
import { employeesApi } from "@/services/api";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/common/Logo";

interface BirthdayInfo {
  employeeId: string;
  name: string;
  designation?: string;
  department?: string;
  isToday: boolean;
  age?: number;
  message?: string;
}

function BirthdayCard({
  birthday,
  isSelf,
  className,
}: {
  birthday: BirthdayInfo;
  isSelf: boolean;
  className?: string;
}) {
  const firstName = birthday.name?.split(" ")[0] || "teammate";
  const teamWish = isSelf
    ? `Happy birthday, ${firstName}. The Anytime Diesel team wishes you a wonderful year ahead.`
    : `Today we celebrate ${firstName}. Please join us in wishing them a happy birthday.`;
  const detail = [birthday.designation, birthday.department].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.06] via-card to-card shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-primary/15 bg-primary/[0.04] px-4 py-2.5 sm:px-5">
        <Logo variant="mark" className="h-6 w-6" />
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          {isSelf ? "Your birthday" : "Birthday today"}
        </span>
      </div>
      <div className="flex items-center gap-3.5 p-4 sm:gap-4 sm:p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground sm:h-14 sm:w-14">
          <Cake className="h-6 w-6 sm:h-7 sm:w-7" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {birthday.name}
          </p>
          <p className="mt-1 break-words text-sm leading-5 text-foreground/90">{teamWish}</p>
          {detail && <p className="mt-1.5 truncate text-xs text-muted-foreground">{detail}</p>}
        </div>

        <PartyPopper className="hidden h-6 w-6 shrink-0 text-primary sm:block" aria-hidden="true" />
      </div>
    </div>
  );
}

export function BirthdayMarquee() {
  const { user } = useAuth();
  const [celebrants, setCelebrants] = useState<BirthdayInfo[]>([]);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!user) return;
    employeesApi
      .birthdays()
      .then((data) => {
        const today = todaysBirthdays(data);
        const selfId = user.employeeId;
        today.sort((a, b) => {
          if (selfId && a.employeeId === selfId) return -1;
          if (selfId && b.employeeId === selfId) return 1;
          return a.name.localeCompare(b.name);
        });
        setCelebrants(today);
      })
      .catch(() => setCelebrants([]));
  }, [user]);

  const onSelect = useCallback((carouselApi: CarouselApi) => {
    if (!carouselApi) return;
    setCurrent(carouselApi.selectedScrollSnap());
  }, []);

  useEffect(() => {
    if (!api) return;
    onSelect(api);
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api, onSelect]);

  useEffect(() => {
    if (!api || celebrants.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tick = () => {
      if (document.visibilityState === "visible") api.scrollNext();
    };
    const timer = window.setInterval(tick, 5500);
    return () => window.clearInterval(timer);
  }, [api, celebrants.length]);

  const countLabel = useMemo(() => {
    if (celebrants.length <= 1) return null;
    return `${current + 1} of ${celebrants.length}`;
  }, [celebrants.length, current]);

  if (celebrants.length === 0) return null;

  if (celebrants.length === 1) {
    return (
      <div className="mb-5 w-full">
        <BirthdayCard
          birthday={celebrants[0]}
          isSelf={celebrants[0].employeeId === user?.employeeId}
        />
      </div>
    );
  }

  return (
    <div className="mb-5 w-full space-y-2.5">
      <div className="relative">
        <Carousel
          setApi={setApi}
          opts={{ loop: true, align: "start", watchDrag: true, dragFree: false }}
          className="w-full cursor-grab active:cursor-grabbing"
          data-no-page-swipe
        >
          <CarouselContent className="-ml-0">
            {celebrants.map((birthday) => (
              <CarouselItem key={birthday.employeeId} className="basis-full pl-0">
                <BirthdayCard
                  birthday={birthday}
                  isSelf={birthday.employeeId === user?.employeeId}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute left-2 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border-border/80 bg-background/95 shadow-sm backdrop-blur-sm sm:left-3"
          onClick={() => api?.scrollPrev()}
          aria-label="Previous birthday"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute right-2 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border-border/80 bg-background/95 shadow-sm backdrop-blur-sm sm:right-3"
          onClick={() => api?.scrollNext()}
          aria-label="Next birthday"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2">
        {celebrants.map((birthday, index) => (
          <button
            key={birthday.employeeId}
            type="button"
            aria-label={`Go to ${birthday.name}'s birthday card`}
            onClick={() => api?.scrollTo(index)}
            className={cn(
              "h-2 rounded-full transition-all",
              current === index ? "w-6 bg-primary" : "w-2 bg-primary/30 hover:bg-primary/50",
            )}
          />
        ))}
        {countLabel && (
          <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">{countLabel}</span>
        )}
      </div>
    </div>
  );
}
