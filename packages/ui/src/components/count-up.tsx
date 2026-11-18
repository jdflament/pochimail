import { useCountUp } from "@pochimail/ui/hooks/use-count-up";

/**
 * A number that rolls up once from 0 when it lands (600ms), e.g. <SignalRow figure={<CountUp value={7} />} />.
 * Screen readers get the final value once (the rolling digits are aria-hidden); the final value also reserves the width, so nothing shifts.
 * A component rather than a bare hook because the accessible-value wiring would otherwise repeat at every use.
 */
function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  const text = (n: number) => (format ? format(n) : String(n));
  return (
    <span data-slot="count-up" className="inline-grid justify-items-start tabular-nums">
      <span className="col-start-1 row-start-1 opacity-0">{text(value)}</span>
      <span aria-hidden="true" className="col-start-1 row-start-1">
        {text(shown)}
      </span>
    </span>
  );
}

export { CountUp };
