export const DEFAULT_SCXML_TEMPLATE = `<scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:viz="http://visual-scxml-editor/metadata" version="1.0" datamodel="ecmascript" name="fa_argon">
  <datamodel>
    <data expr="0.0" id="ArgonLine_bar"/>
  </datamodel>
  <state id="boot_up" viz:xywh="-1342,-712,160,80">
    <transition event="loop_open == 1 || Oxygen &gt; 19%" target="loop_open" viz:waypoints="-1285,-572;-1355,-546"/>
    <transition event="loop_open == 0" target="loop_closed" viz:waypoints="-1214,-573;-1043,-530"/>
  </state>
  <state id="loop_open" viz:xywh="-1451,-496,160,80" initial="state_1">
    <onentry>
      <assign location="light" expr="0xFFFFFF"/>
    </onentry>
        <state id="state_1" viz:xywh="-88,81,206,80">
      <transition event="event100" target="state_2" viz:id="8a35d658-0f62-4195-a85f-ff62411a21a7" viz:sourceHandle="left" viz:targetHandle="right" viz:waypoints="183,292"/>
      <transition event="event200" target="state_2" viz:id="ed5c07b3-3fff-4ddb-b361-b2cab99e4d41" viz:sourceHandle="bottom" viz:targetHandle="top"/>
    </state>
    <state id="state_2" viz:xywh="250,100,160,80"/>
  </state>
  <state id="loop_closed" initial="hal_1" viz:xywh="-1115,-462,188,82">
    <state id="hal_1" viz:xywh="-220,45,176,85">
      <transition event="cmd: hal3" target="hal_3" viz:sourceHandle="right" viz:targetHandle="left"/>
      <onentry>
        <assign location="light" expr="0xFFFFFF"/>
      </onentry>
      
    </state>
    <state id="hal_3" viz:xywh="97,51,160,80" initial="not_connected">
      <state id="cooling_water_connected" viz:xywh="-270,580,303,66">
        <transition event="chiller_power_current &gt; 3" target="chiller_connected"/>
      </state>
      <state id="power_OK" viz:xywh="-227,143,208,89">
        <transition event="argon_pressure &gt; 2" target="argon_OK"/>
      </state>
      <state id="not_connected" viz:xywh="-244,-112,251,82">
        <transition event="server_queue_length == 0" target="server_connection_OK"/>
      </state>
      <state id="chiller_connected" viz:xywh="-247,719,257,66">
        <transition event="" target="self_check"/>
      </state>
      <state id="server_connection_OK" viz:xywh="-273,18,305,70">
        <transition event="power == 3" target="power_OK"/>
      </state>
      <state id="fully_connected" initial="syste_ready" viz:xywh="201,422,215,82">
        <state id="system_ready" viz:xywh="-373,-2,213,77">
          <onentry>
            <assign location="light" expr="0x800080"/>
          </onentry>
          <transition event="cmd: purge" target="purge" viz:sourceHandle="bottom" viz:targetHandle="top" viz:waypoints="-291,111;-420,131"/>
          <transition event="cmd: heat&amp;purge" target="heat&amp;purge" viz:sourceHandle="bottom" viz:targetHandle="top" viz:waypoints="-238,116;-91,139"/>
        </state>
        <state id="purge" viz:xywh="-516,171,160,80">
          <transition event="cmd: heat&amp;purge" target="heat&amp;purge" viz:sourceHandle="right" viz:targetHandle="left"/>
        </state>
        <state id="heat&amp;purge" viz:xywh="-162,187,180,82">
          <transition event="event" target="ready_to_pump"/>
        </state>
        <state id="ready_to_pump" initial="ready" viz:xywh="-254,339,210,85">
          <state id="pumping" initial="pumping_internal" viz:xywh="170,306,160,80">
            <state id="pumping_internal" viz:xywh="-191,-13,281,80">
              <transition event="cmd: pump_external" target="pumping_external" viz:sourceHandle="bottom" viz:targetHandle="top"/>
              <transition event="cmd:take_sample" target="take_online_sample" viz:sourceHandle="right" viz:targetHandle="left"/>
            </state>
            <state id="pumping_external" viz:xywh="-195,160,243,80">
              <transition event="cmd: pump_internal" target="pumping_internal" viz:sourceHandle="left" viz:targetHandle="left"/>
              <transition event="cmd:take_sample" target="take_online_sample" viz:sourceHandle="right" viz:targetHandle="left"/>
            </state>
            <state id="take_online_sample" viz:xywh="238,84,256,70"/>
            <transition event="cmd:deprime" target="deprime" viz:sourceHandle="right" viz:targetHandle="left"/>
            <onentry>
              <assign location="pumping" expr="1"/>
            </onentry>
          </state>
          <state id="prime_pump" viz:xywh="-167,265,202,79">
            <transition event="main_flow_deltaP &gt; 1" target="pumping" viz:sourceHandle="right" viz:targetHandle="left"/>
          <onentry><assign location="light" expr="0x00FF00"/></onentry></state>
          <state id="deprime" viz:xywh="475,248,160,80">
            <onentry>
              <assign location="pumping" expr="0"/>
            </onentry>
            <transition event="after: 30s" target="ready" viz:sourceHandle="right" viz:targetHandle="right"/>
          </state>
          <state id="ready" viz:xywh="-3,74,184,80">
            <transition event="cmd:pump" target="prime_pump"/>
          <onentry><assign location="light" expr="0x00FFFF"/></onentry></state>
          <transition event="Leak_* == 1" target="leak_detected"/>
          <transition event="filter_flow_sensor_deltaP &lt; 0.1" target="salt_filter_blocked"/>
        </state>
        <state id="leak_detected" viz:xywh="82,363,202,85"/>
        <state id="salt_filter_blocked" viz:xywh="82,547,233,85"/>
        <transition event="after: 24h" target="not_connected" viz:sourceHandle="right" viz:targetHandle="right" viz:waypoints="787,380;721,-29"/>
      </state>
      <state id="argon_OK" viz:xywh="-235,303,222,80">
        <transition event="nitrogen_pressure &gt; 2" target="nitrogen_OK"/>
      </state>
      <state id="nitrogen_OK" viz:xywh="-228,438,218,82">
        <transition event="cooling_water_in_temp &lt; 10" target="cooling_water_connected"/>
      </state>
      <state id="self_check" initial="check_all_heaters" viz:xywh="218,212,175,82">
        <state id="check_all_heaters" viz:xywh="-243,-130,291,84">
          <transition event="event" target="check_temp_to_heaters"/>
        </state>
        <state id="check_temp_to_heaters" viz:xywh="-229,6,283,78">
          <transition event="event" target="check_gas_leak_rate"/>
        </state>
        <state id="check_gas_leak_rate" viz:xywh="-225,147,260,64">
          <transition event="event" target="check_soft_valve"/>
        </state>
        <state id="check_soft_valve" viz:xywh="-203,274,217,88"/>
        <transition event="deltaP_gas_filter &lt;= 0.3" target="fully_connected"/>
        <transition event="deltaP_gas_filter &gt; 0.3" target="gas_filter_blocked"/>
      </state>
      <state id="gas_filter_blocked" viz:xywh="525,226,236,68"/>
      <transition event="cmd: hal1" target="hal_1" viz:sourceHandle="bottom" viz:targetHandle="bottom"/>
      <onentry>
        <assign location="light" expr="0xFFBF00"/>
      </onentry>
    </state>
  </state>
  <state id="Emergency_stop" initial="gas_safestate" viz:xywh="-998,-764,319,128">
    <state id="gas_safestate" viz:xywh="-163,-85,250,70">
      <transition event="" target="stop_pump" viz:sourceHandle="bottom" viz:targetHandle="top"/>
    <onentry><assign location="safe_valve" expr="0"/></onentry></state>
    <state id="stop_pump" viz:xywh="-134,91,183,63">
      <transition event="" target="heaters_off" viz:sourceHandle="bottom" viz:targetHandle="top"/>
    <onentry><assign location="pump_rpm" expr="0"/></onentry></state>
    <state id="heaters_off" viz:xywh="-133,266,186,57"><onentry><assign location="oven*" expr="0"/></onentry></state>
    <transition event="emergency_stop == 0" target="boot_up" viz:sourceHandle="left" viz:targetHandle="top"/>
  <onentry><assign location="light" expr="0xFF0000"/></onentry></state>
</scxml>`;
