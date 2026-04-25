| **Tag**        | **Required Attributes**                    | **Optional Attributes**                                                 |
| -------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| `<scxml>`      | —                                          | `initial`, `name`, `datamodel`, `version`, `xmlns`                      |
| `<state>`      | `id` (if it is a target of transitions)    | `initial`, `src`                                                        |
| `<parallel>`   | `id` (if it is a target of transitions)    | —                                                                       |
| `<final>`      | `id` (if it is a target of transitions)    | —                                                                       |
| `<transition>` | `target` (if not internal/self-transition) | `event`, `cond`, `type`, `anchor`, `path`                               |
| `<history>`    | `id` (if referenced by transitions)        | `type` (`shallow` or `deep`)                                            |
| `<initial>`    | — (but must contain a `<transition>`)      | —                                                                       |
| `<onentry>`    | —                                          | —                                                                       |
| `<onexit>`     | —                                          | —                                                                       |
| `<invoke>`     | `type` (or `src`)                          | `id`, `srcexpr`, `autoforward`                                          |
| `<finalize>`   | —                                          | —                                                                       |
| `<datamodel>`  | —                                          | —                                                                       |
| `<data>`       | `id`                                       | `expr`, `src`                                                           |
| `<assign>`     | `location`                                 | `expr`, `src`                                                           |
| `<donedata>`   | —                                          | —                                                                       |
| `<content>`    | —                                          | —                                                                       |
| `<script>`     | —                                          | `src`                                                                   |
| `<send>`       | `event` or `eventexpr`                     | `target`, `targetexpr`, `type`, `delay`, `id`, `idlocation`, `namelist` |
| `<cancel>`     | `sendid` or `sendidexpr`                   | —                                                                       |
| `<raise>`      | `event`                                    | —                                                                       |
| `<log>`        | `expr`                                     | `label`                                                                 |
| `<if>`         | `cond`                                     | —                                                                       |
| `<elseif>`     | `cond`                                     | —                                                                       |
| `<else>`       | —                                          | —                                                                       |
| `<foreach>`    | `item`, `array`                            | `index`                                                                 |
