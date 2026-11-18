// main_region ships with one Initial child state: the downstream generator
// rejects a main_region without an initial transition that targets a state,
// so an empty main_region would not compile until the user added one.
export const DEFAULT_SCXML_TEMPLATE = `<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0" datamodel="ecmascript" name="main" initial="main_region">
  <datamodel>
    <!-- Define variables, configuration values, and runtime data here -->
  </datamodel>

  <state id="main_region" initial="state_1">
    <!-- Add states, transitions, and logic inside this root state -->
    <state id="state_1"/>
  </state>
</scxml>`;
