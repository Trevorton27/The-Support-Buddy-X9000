import { DevinClient } from "./client";
import { MockDevinAdapter } from "./mock";
import type { IDevinAdapter } from "./types";

export function getDevinAdapter(): IDevinAdapter {
  const key = process.env.DEVIN_API_KEY;
  if (key) return new DevinClient();
  return new MockDevinAdapter();
}
