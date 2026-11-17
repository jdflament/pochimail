/** Time source port. Core never reads the system clock directly. */
export interface Clock {
  now(): Date;
}
