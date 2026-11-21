import { createRpcClient } from "#shared/ipc/client.ts";
import { serveRpc } from "#shared/ipc/server.ts";
import { fromDomPort } from "#shared/ipc/transport.ts";
import { App } from "../../app/app.tsx";
import { createAppRouter } from "../../router.tsx";

// Renders the real onboarding layout and pages against a fake worker, starting on Welcome.
const fakeWorker = () => {
  const { port1, port2 } = new MessageChannel();
  port1.start();
  port2.start();
  serveRpc(fromDomPort(port2), {
    procedures: {
      "app.state": () => ({ status: "ready" as const, hasConnectedAccount: false }),
      "device.name": () => "Mac" as const,
      "accounts.list": () => [],
      "settings.get": () => ({
        autonomy: "suggest" as const,
        capabilities: {
          "catch-what-matters": true,
          declutter: true,
          organize: true,
          "save-documents": true,
        },
        notifications: true,
      }),
      "settings.update": () => undefined,
    },
    subscriptions: { "app.events": () => undefined, "scan.progress": () => undefined },
  });
  return createRpcClient(fromDomPort(port1));
};

const Onboarding = ({ path }: { path: string }) => {
  const client = fakeWorker();
  const router = createAppRouter(
    { getWorkerClient: () => Promise.resolve(client) },
    { initialEntries: [path] },
  );
  return <App workerClient={client} router={router} />;
};

export default { title: "Screens/Onboarding", parameters: { layout: "fullscreen" } };

// Guards: a screen drifting from docs/design/screens/html (Main.html, ConnectPromise.html): oversized Pochi or headline,
// wrong button, row or step-pill size. Runs in a real browser, where Tailwind has produced the computed sizes.
type Sizes = Record<string, number>;
const checkSizes = async (
  canvasElement: HTMLElement,
  screen: string,
  expected: Sizes,
  read: (query: (selector: string) => Element | null) => Sizes,
) => {
  const query = (selector: string) => canvasElement.querySelector(selector);
  for (let attempt = 0; attempt < 50 && !query("h1"); attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 100));
  const measured = read(query);
  if (JSON.stringify(measured) !== JSON.stringify(expected))
    throw new Error(
      `${screen} differs from its reference: ${JSON.stringify(measured)} vs ${JSON.stringify(expected)}`,
    );
};
// A missing element reads as 0 and fails the check.
const box = (element: Element | null, side: "width" | "height") =>
  Math.round(element?.getBoundingClientRect()[side] ?? 0);
const fontSize = (element: Element | null) =>
  element ? parseFloat(getComputedStyle(element).fontSize) : 0;
const phone = () => window.innerWidth < 560;

export const Welcome = {
  render: () => <Onboarding path="/welcome" />,
  play: ({ canvasElement }: { canvasElement: HTMLElement }) =>
    checkSizes(
      canvasElement,
      "Welcome",
      { headline: phone() ? 32 : 40, pochi: 240, button: 260, stepPill: 20 },
      (query) => ({
        headline: fontSize(query("h1")),
        pochi: box(query("[data-slot=mascot]"), "width"),
        button: box(query("a[href='/connect']"), "width"),
        stepPill: box(query("[aria-current=step]"), "width"),
      }),
    ),
};
export const Connect = {
  render: () => <Onboarding path="/connect" />,
  play: ({ canvasElement }: { canvasElement: HTMLElement }) =>
    checkSizes(
      canvasElement,
      "Connect",
      { headline: phone() ? 28 : 32, provider: 52, stepPill: 20 },
      (query) => ({
        headline: fontSize(query("h1")),
        provider: box(query("main button"), "height"),
        stepPill: box(query("[aria-current=step]"), "width"),
      }),
    ),
};
export const Setup = { render: () => <Onboarding path="/setup" /> };
