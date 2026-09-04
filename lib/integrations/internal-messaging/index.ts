import { MockInternalMessagingAdapter } from "./mock";

export function getInternalMessagingAdapter() {
  return new MockInternalMessagingAdapter();
}
