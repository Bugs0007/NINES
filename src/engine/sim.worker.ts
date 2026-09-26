/// <reference lib="webworker" />
import { SimHost, type HostIn, type HostOut } from "./host";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const host = new SimHost((m: HostOut) => scope.postMessage(m));
scope.onmessage = (e: MessageEvent<HostIn>) => host.handle(e.data);
