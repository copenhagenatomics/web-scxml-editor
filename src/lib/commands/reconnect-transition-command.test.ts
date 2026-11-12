import { describe, it, expect } from 'vitest';
import { ReconnectTransitionCommand } from './reconnect-transition-command';

const SCXML_HEADER = '<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0"';

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

function state(doc: Document, id: string): Element {
  const el = doc.querySelector(`state[id="${id}"]`);
  if (!el) throw new Error(`state ${id} not found`);
  return el;
}

function directActions(stateEl: Element, block: string, tag: string): Element[] {
  return Array.from(stateEl.children)
    .filter((c) => c.tagName === block)
    .flatMap((b) => Array.from(b.children).filter((c) => c.tagName === tag));
}

const TIMER_A_TO_B = `${SCXML_HEADER} initial="StateA">
  <state id="StateA">
    <onentry><send event="StateA_t_0_timeEvent_0" delay="2s"/></onentry>
    <onexit><cancel sendid="StateA_t_0_timeEvent_0"/></onexit>
    <transition event="StateA_t_0_timeEvent_0" target="StateB"/>
  </state>
  <state id="StateB"/>
  <state id="StateC"/>
</scxml>`;

describe('ReconnectTransitionCommand', () => {
  describe('time-event transitions when the source changes (#79)', () => {
    it('moves the send/cancel timer to the new source and re-issues the token for it', () => {
      const result = new ReconnectTransitionCommand(
        'StateA', 'StateB', 'StateC', 'StateB', 'StateA_t_0_timeEvent_0'
      ).execute(TIMER_A_TO_B);

      expect(result.success).toBe(true);
      const doc = parse(result.newContent);
      const a = state(doc, 'StateA');
      const c = state(doc, 'StateC');

      expect(a.querySelector('transition')).toBeNull();
      expect(a.querySelector('onentry')).toBeNull();
      expect(a.querySelector('onexit')).toBeNull();

      const send = directActions(c, 'onentry', 'send');
      const cancel = directActions(c, 'onexit', 'cancel');
      expect(send).toHaveLength(1);
      expect(send[0].getAttribute('event')).toBe('StateC_t_0_timeEvent_0');
      expect(send[0].getAttribute('delay')).toBe('2s');
      expect(cancel).toHaveLength(1);
      expect(cancel[0].getAttribute('sendid')).toBe('StateC_t_0_timeEvent_0');
      expect(c.querySelector('transition')?.getAttribute('event')).toBe('StateC_t_0_timeEvent_0');
      expect(result.newContent).not.toContain('StateA_t_0_timeEvent_0');
    });

    it('keeps the delayexpr attribute when moving the timer', () => {
      const xml = TIMER_A_TO_B.replace('delay="2s"', 'delayexpr="this.t * 1000"');
      const result = new ReconnectTransitionCommand(
        'StateA', 'StateB', 'StateC', 'StateB', 'StateA_t_0_timeEvent_0'
      ).execute(xml);
      const send = directActions(state(parse(result.newContent), 'StateC'), 'onentry', 'send');
      expect(send[0].getAttribute('delayexpr')).toBe('this.t * 1000');
    });

    it("appends to the new source's existing onentry/onexit and keeps its other actions", () => {
      const xml = TIMER_A_TO_B.replace(
        '<state id="StateC"/>',
        '<state id="StateC"><onentry><assign location="x" expr="1"/></onentry><onexit><assign location="y" expr="2"/></onexit></state>'
      );
      const result = new ReconnectTransitionCommand(
        'StateA', 'StateB', 'StateC', 'StateB', 'StateA_t_0_timeEvent_0'
      ).execute(xml);
      const c = state(parse(result.newContent), 'StateC');
      expect(c.querySelectorAll(':scope > onentry')).toHaveLength(1);
      expect(c.querySelectorAll(':scope > onexit')).toHaveLength(1);
      expect(directActions(c, 'onentry', 'assign')).toHaveLength(1);
      expect(directActions(c, 'onentry', 'send')).toHaveLength(1);
      expect(directActions(c, 'onexit', 'assign')).toHaveLength(1);
      expect(directActions(c, 'onexit', 'cancel')).toHaveLength(1);
    });

    it("keeps the old source's other actions and only removes the timer ones", () => {
      const xml = TIMER_A_TO_B.replace(
        '<onentry><send',
        '<onentry><assign location="x" expr="1"/><send'
      );
      const result = new ReconnectTransitionCommand(
        'StateA', 'StateB', 'StateC', 'StateB', 'StateA_t_0_timeEvent_0'
      ).execute(xml);
      const a = state(parse(result.newContent), 'StateA');
      expect(directActions(a, 'onentry', 'assign')).toHaveLength(1);
      expect(directActions(a, 'onentry', 'send')).toHaveLength(0);
      expect(a.querySelector('onexit')).toBeNull();
    });

    it('picks the next free index when the new source already has a timer', () => {
      const xml = TIMER_A_TO_B.replace(
        '<state id="StateC"/>',
        `<state id="StateC">
          <onentry><send event="StateC_t_0_timeEvent_0" delay="5s"/></onentry>
          <onexit><cancel sendid="StateC_t_0_timeEvent_0"/></onexit>
          <transition event="StateC_t_0_timeEvent_0" target="StateA"/>
        </state>`
      );
      const result = new ReconnectTransitionCommand(
        'StateA', 'StateB', 'StateC', 'StateB', 'StateA_t_0_timeEvent_0'
      ).execute(xml);
      const c = state(parse(result.newContent), 'StateC');
      const events = directActions(c, 'onentry', 'send').map((s) => s.getAttribute('event'));
      expect(events).toEqual(['StateC_t_0_timeEvent_0', 'StateC_t_1_timeEvent_1']);
      const toB = Array.from(c.querySelectorAll(':scope > transition')).find(
        (t) => t.getAttribute('target') === 'StateB'
      );
      expect(toB?.getAttribute('event')).toBe('StateC_t_1_timeEvent_1');
    });

    it('rewrites only the timer token in a comma-merged event list', () => {
      const xml = TIMER_A_TO_B.replace(
        'transition event="StateA_t_0_timeEvent_0"',
        'transition event="StateA_t_0_timeEvent_0, clicked"'
      );
      const result = new ReconnectTransitionCommand(
        'StateA', 'StateB', 'StateC', 'StateB', 'StateA_t_0_timeEvent_0, clicked'
      ).execute(xml);
      const c = state(parse(result.newContent), 'StateC');
      expect(c.querySelector('transition')?.getAttribute('event')).toBe(
        'StateC_t_0_timeEvent_0, clicked'
      );
    });

    it('leaves the timer in place when only the target changes', () => {
      const result = new ReconnectTransitionCommand(
        'StateA', 'StateB', 'StateA', 'StateC', 'StateA_t_0_timeEvent_0'
      ).execute(TIMER_A_TO_B);
      const doc = parse(result.newContent);
      const a = state(doc, 'StateA');
      expect(a.querySelector('transition')?.getAttribute('target')).toBe('StateC');
      expect(a.querySelector('transition')?.getAttribute('event')).toBe('StateA_t_0_timeEvent_0');
      expect(directActions(a, 'onentry', 'send')).toHaveLength(1);
      expect(directActions(a, 'onexit', 'cancel')).toHaveLength(1);
    });

    it('does not rename a time-event-shaped event the old source does not send', () => {
      const xml = `${SCXML_HEADER} initial="StateA">
        <state id="StateA"><transition event="StateA_t_0_timeEvent_0" target="StateB"/></state>
        <state id="StateB"/><state id="StateC"/>
      </scxml>`;
      const result = new ReconnectTransitionCommand(
        'StateA', 'StateB', 'StateC', 'StateB', 'StateA_t_0_timeEvent_0'
      ).execute(xml);
      const c = state(parse(result.newContent), 'StateC');
      expect(c.querySelector('transition')?.getAttribute('event')).toBe('StateA_t_0_timeEvent_0');
      expect(c.querySelector('onentry')).toBeNull();
    });

    it('leaves plain-event transitions unchanged when the source moves', () => {
      const xml = `${SCXML_HEADER} initial="StateA">
        <state id="StateA"><onentry><assign location="x" expr="1"/></onentry><transition event="go" target="StateB"/></state>
        <state id="StateB"/><state id="StateC"/>
      </scxml>`;
      const result = new ReconnectTransitionCommand(
        'StateA', 'StateB', 'StateC', 'StateB', 'go'
      ).execute(xml);
      const doc = parse(result.newContent);
      expect(state(doc, 'StateC').querySelector('transition')?.getAttribute('event')).toBe('go');
      expect(directActions(state(doc, 'StateA'), 'onentry', 'assign')).toHaveLength(1);
      expect(state(doc, 'StateC').querySelector('onentry')).toBeNull();
    });

    it('undo moves the timer back and restores the original token', () => {
      const command = new ReconnectTransitionCommand(
        'StateA', 'StateB', 'StateC', 'StateB', 'StateA_t_0_timeEvent_0'
      );
      const executed = command.execute(TIMER_A_TO_B);
      expect(executed.success).toBe(true);

      const undone = command.undo(executed.newContent);
      expect(undone.success).toBe(true);
      const doc = parse(undone.newContent);
      const a = state(doc, 'StateA');
      const c = state(doc, 'StateC');

      expect(a.querySelector('transition')?.getAttribute('event')).toBe('StateA_t_0_timeEvent_0');
      expect(directActions(a, 'onentry', 'send')[0]?.getAttribute('event')).toBe('StateA_t_0_timeEvent_0');
      expect(directActions(a, 'onexit', 'cancel')[0]?.getAttribute('sendid')).toBe('StateA_t_0_timeEvent_0');
      expect(c.children).toHaveLength(0);
      expect(undone.newContent).not.toContain('StateC_t_');
    });
  });
});
