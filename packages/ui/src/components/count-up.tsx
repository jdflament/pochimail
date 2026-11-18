import { useCountUp } from "@pochimail/ui/hooks/use-count-up";

/** A number that rolls up once from 0 when it lands (600ms), e.g. <SignalRow figure={<CountUp value={7} />} />. */
function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  return <span data-slot="count-up">{format ? format(shown) : shown}</span>;
}

export { CountUp };
