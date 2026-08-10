/**
 * A starter SCXML document so the editor opens with something to render.
 * Coordinates are stored in each node's <metadata> block under `ui:layout`
 * (attributes are preserved verbatim by scxml-parser for round-trip fidelity).
 */
export const DEFAULT_SCXML = `<?xml version="1.0" encoding="UTF-8"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="idle">
  <state id="idle">
    <metadata>
      <ui:layout x="100" y="240" width="140" height="60" />
    </metadata>
    <transition event="start" target="running">
      <metadata>
        <transitionId value="idle:0" />
      </metadata>
    </transition>
  </state>

  <state id="running">
    <metadata>
      <ui:layout x="120" y="400" width="160" height="80" />
    </metadata>
    <state id="processing">
      <metadata>
        <ui:layout x="180" y="120" width="140" height="60" />
      </metadata>
      <transition event="done" target="finished">
        <metadata>
          <transitionId value="processing:0" />
        </metadata>
      </transition>
    </state>
    <transition event="cancel" target="idle">
      <metadata>
        <transitionId value="running:0" />
      </metadata>
    </transition>
  </state>

  <final id="finished">
    <metadata>
      <ui:layout x="200" y="560" width="120" height="50" />
    </metadata>
  </final>
</scxml>
`;
