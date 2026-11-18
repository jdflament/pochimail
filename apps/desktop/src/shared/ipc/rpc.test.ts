import { describeRpcContract } from "./rpc.contract.ts";
import { fromDomPort } from "./transport.ts";

describeRpcContract("MessageChannel", () => {
  const { port1, port2 } = new MessageChannel();
  port1.start();
  port2.start();
  return {
    client: fromDomPort(port1),
    server: fromDomPort(port2),
    close: () => {
      port1.close();
      port2.close();
    },
  };
});
