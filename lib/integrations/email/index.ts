import { MockEmailAdapter } from "./mock";

export function getEmailAdapter() {
  return new MockEmailAdapter();
}
