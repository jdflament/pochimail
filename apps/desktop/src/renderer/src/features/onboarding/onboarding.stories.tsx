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

const waitFor = async <T,>(read: () => T | null): Promise<T> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Welcome did not render");
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

// Guards: Welcome drifting from docs/design/screens/html/Main.html (oversized Pochi or headline, wrong button or step pill).
// Runs in a real browser, where Tailwind has produced the computed sizes.
export const Welcome = {
  render: () => <Onboarding path="/welcome" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const heading = await waitFor(() => canvasElement.querySelector("h1"));
    // A missing element reads as width 0 and fails the check.
    const width = (selector: string) =>
      Math.round(canvasElement.querySelector(selector)?.getBoundingClientRect().width ?? 0);
    const measured = {
      headline: parseFloat(getComputedStyle(heading).fontSize),
      pochi: width("[data-slot=mascot]"),
      button: width("a[href='/connect']"),
      stepPill: width("[aria-current=step]"),
    };
    const expected = {
      headline: window.innerWidth < 560 ? 32 : 40,
      pochi: 240,
      button: 260,
      stepPill: 20,
    };
    if (JSON.stringify(measured) !== JSON.stringify(expected)) {
      throw new Error(
        `Welcome differs from Main.html: ${JSON.stringify(measured)} vs ${JSON.stringify(expected)}`,
      );
    }
  },
};
export const Connect = { render: () => <Onboarding path="/connect" /> };
export const Setup = { render: () => <Onboarding path="/setup" /> };
