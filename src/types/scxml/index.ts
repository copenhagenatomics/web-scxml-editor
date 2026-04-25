export interface SCXMLDocument {
  scxml: SCXMLElement;
}

export interface SCXMLElement {
  '@_name'?: string;
  '@_xmlns'?: string;
  '@_version'?: string;
  '@_datamodel'?: string;
  '@_binding'?: 'early' | 'late';
  '@_initial'?: string;
  initial?: InitialElement | InitialElement[];
  datamodel?: DataModelElement;
  state?: StateElement | StateElement[];
  parallel?: ParallelElement | ParallelElement[];
  final?: FinalElement | FinalElement[];
  script?: ScriptElement | ScriptElement[];
}

export interface StateElement {
  '@_id': string;
  '@_initial'?: string;
  initial?: InitialElement;
  onentry?: OnEntryElement | OnEntryElement[];
  onexit?: OnExitElement | OnExitElement[];
  transition?: TransitionElement | TransitionElement[];
  state?: StateElement | StateElement[];
  parallel?: ParallelElement | ParallelElement[];
  final?: FinalElement | FinalElement[];
  history?: HistoryElement | HistoryElement[];
  datamodel?: DataModelElement;
  invoke?: InvokeElement | InvokeElement[];
}

export interface ParallelElement {
  '@_id': string;
  onentry?: OnEntryElement | OnEntryElement[];
  onexit?: OnExitElement | OnExitElement[];
  transition?: TransitionElement | TransitionElement[];
  state?: StateElement | StateElement[];
  parallel?: ParallelElement | ParallelElement[];
  history?: HistoryElement | HistoryElement[];
  datamodel?: DataModelElement;
  invoke?: InvokeElement | InvokeElement[];
}

export interface FinalElement {
  '@_id': string;
  onentry?: OnEntryElement | OnEntryElement[];
  onexit?: OnExitElement | OnExitElement[];
  donedata?: DoneDataElement;
}

export interface TransitionElement {
  '@_event'?: string;
  '@_cond'?: string;
  '@_target'?: string;
  '@_type'?: 'internal' | 'external';
  executable?: ExecutableElement[];
}

export interface OnEntryElement {
  executable?: ExecutableElement[];
}

export interface OnExitElement {
  executable?: ExecutableElement[];
}

export interface InitialElement {
  transition: TransitionElement | TransitionElement[];
}

export interface HistoryElement {
  '@_id': string;
  '@_type'?: 'shallow' | 'deep';
  transition?: TransitionElement;
}

export interface DataModelElement {
  data?: DataElement | DataElement[];
}

export interface DataElement {
  '@_id': string;
  '@_src'?: string;
  '@_expr'?: string;
  '#text'?: string;
}

export interface InvokeElement {
  '@_type'?: string;
  '@_src'?: string;
  '@_id'?: string;
  '@_idlocation'?: string;
  '@_srcexpr'?: string;
  '@_autoforward'?: boolean;
  param?: ParamElement | ParamElement[];
  finalize?: FinalizeElement;
  content?: ContentElement;
}

export interface ParamElement {
  '@_name': string;
  '@_expr'?: string;
  '@_location'?: string;
}

export interface FinalizeElement {
  executable?: ExecutableElement[];
}

export interface ContentElement {
  '@_expr'?: string;
  '#text'?: string;
}

export interface DoneDataElement {
  content?: ContentElement;
  param?: ParamElement | ParamElement[];
}

export interface ScriptElement {
  '@_src'?: string;
  '#text'?: string;
}

export type ExecutableElement = 
  | RaiseElement 
  | IfElement 
  | ElseIfElement 
  | ElseElement 
  | ForEachElement 
  | LogElement 
  | AssignElement 
  | ScriptElement 
  | SendElement 
  | CancelElement;

export interface RaiseElement {
  '@_event': string;
}

export interface IfElement {
  '@_cond': string;
  executable?: ExecutableElement[];
}

export interface ElseIfElement {
  '@_cond': string;
  executable?: ExecutableElement[];
}

export interface ElseElement {
  executable?: ExecutableElement[];
}

export interface ForEachElement {
  '@_array': string;
  '@_item': string;
  '@_index'?: string;
  executable?: ExecutableElement[];
}

export interface LogElement {
  '@_label'?: string;
  '@_expr'?: string;
}

export interface AssignElement {
  '@_location': string;
  '@_expr'?: string;
}

export interface SendElement {
  '@_event'?: string;
  '@_eventexpr'?: string;
  '@_target'?: string;
  '@_targetexpr'?: string;
  '@_type'?: string;
  '@_typeexpr'?: string;
  '@_id'?: string;
  '@_idlocation'?: string;
  '@_delay'?: string;
  '@_delayexpr'?: string;
  '@_namelist'?: string;
  param?: ParamElement | ParamElement[];
  content?: ContentElement;
}

export interface CancelElement {
  '@_sendid'?: string;
  '@_sendidexpr'?: string;
}