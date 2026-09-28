import type { JsMsg } from '@nats-io/jetstream';
import { BaseRpcContext } from '@nestjs/microservices';

export class JetStreamContext extends BaseRpcContext<[JsMsg]> {
  constructor(message: JsMsg) {
    super([message]);
  }
  get msgId() {
    return this.args[0].headers?.get('Nats-Msg-Id');
  }
  get subject() {
    return this.args[0].subject;
  }
  get deliveryCount() {
    return this.args[0].info.deliveryCount;
  }
  get redeliveryCount() {
    return Math.max(0, this.deliveryCount - 1);
  }
  get headers() {
    return this.args[0].headers;
  }
}
