import { createRpcClient } from "../../../../shared/ipc/client.ts";
import { serveRpc } from "../../../../shared/ipc/server.ts";
import { fromDomPort } from "../../../../shared/ipc/transport.ts";
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

export const Welcome = { render: () => <Onboarding path="/welcome" /> };
export const Connect = { render: () => <Onboarding path="/connect" /> };
export const Setup = { render: () => <Onboarding path="/setup" /> };
