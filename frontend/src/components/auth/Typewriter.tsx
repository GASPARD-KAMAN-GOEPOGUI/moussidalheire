import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface TypewriterProps {
  text: string;
  speed?: number;
  startDelay?: number;
  onDone?: () => void;
  className?: string;
}

export function Typewriter({ text, speed = 65, startDelay = 0, onDone, className }: TypewriterProps) {
  const prefersReducedMotion = useReducedMotion();
  const [shown, setShown] = useState(prefersReducedMotion ? text : "");
  const [done, setDone] = useState(!!prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion) {
      onDone?.();
      return;
    }
    setShown("");
    setDone(false);
    let i = 0;
    let intervalId: ReturnType<typeof setInterval>;
    const timeoutId = setTimeout(() => {
      intervalId = setInterval(() => {
        i++;
        setShown(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(intervalId);
          setDone(true);
          onDone?.();
        }
      }, speed);
    }, startDelay);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed, startDelay, prefersReducedMotion]);

  return (
    <span className={className}>
      {shown}
      <span
        aria-hidden="true"
        className={`ml-1 inline-block h-[0.9em] w-[3px] translate-y-[0.1em] bg-current align-middle ${
          done ? "opacity-0" : "animate-pulse opacity-90"
        }`}
      />
    </span>
  );
}
