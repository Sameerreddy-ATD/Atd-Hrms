import { useCallback, useEffect, useState } from "react";
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

interface BirthdayInfo {
  employeeId: string;
  name: string;
  designation?: string;
  department?: string;
  isToday: boolean;
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
  const firstName = birthday.name.split(" ")[0];
  const teamWish = isSelf
    ? "The Anytime Diesel Team wishes you a very happy birthday!"
    : `The Anytime Diesel Team wishes ${firstName} a very happy birthday!`;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-pink-200/80 bg-gradient-to-r from-pink-50 via-white to-purple-50 p-4 shadow-sm dark:border-pink-900/40 dark:from-pink-950/20 dark:via-card dark:to-purple-950/20 sm:p-5 lg:px-6 lg:py-5",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-pink-200/40 blur-3xl dark:bg-pink-950/30" />
      <div className="pointer-events-none absolute -bottom-10 left-10 h-24 w-24 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-950/20" />

      <div className="relative flex items-center gap-4 lg:gap-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 text-white shadow-md sm:h-14 sm:w-14 lg:h-16 lg:w-16">
          <Cake className="h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-foreground sm:text-lg lg:text-xl">
              {birthday.name}
            </p>
          </div>
          <p className="mt-1.5 text-sm font-medium text-foreground sm:text-base lg:text-[17px]">
            {teamWish}
          </p>
        </div>

        <PartyPopper className="hidden h-6 w-6 shrink-0 text-pink-500 lg:block" />
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
      .then((data) => setCelebrants(todaysBirthdays(data)))
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
    const timer = window.setInterval(() => {
      api.scrollNext();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [api, celebrants.length]);

  if (celebrants.length === 0) return null;

  if (celebrants.length === 1) {
    return (
      <div className="mb-4 w-full">
        <BirthdayCard
          birthday={celebrants[0]}
          isSelf={celebrants[0].employeeId === user?.employeeId}
        />
      </div>
    );
  }

  return (
    <div className="mb-4 w-full space-y-3">
      <div className="relative">
        <Carousel setApi={setApi} opts={{ loop: true, align: "start" }} className="w-full">
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
          className="absolute left-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border-pink-200/80 bg-white/95 shadow-sm backdrop-blur-sm dark:border-pink-900/40 dark:bg-card/95"
          onClick={() => api?.scrollPrev()}
          aria-label="Previous birthday"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute right-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border-pink-200/80 bg-white/95 shadow-sm backdrop-blur-sm dark:border-pink-900/40 dark:bg-card/95"
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
              current === index ? "w-6 bg-pink-500" : "w-2 bg-pink-300/80 hover:bg-pink-400",
            )}
          />
        ))}
      </div>
    </div>
  );
}
