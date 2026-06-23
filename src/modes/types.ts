import type { EngineMode } from '../services/product-mode.js';

export interface Question {
  key: string;
  text: string;
}

export type LlmPromptKey =
  | 'learningCommitment'
  | 'learningDaily'
  | 'learningDigest'
  | 'learningSwitch'
  | 'habitCommitment'
  | 'habitDaily'
  | 'habitDigest'
  | 'habitSwitch'
  | 'jobhuntCommitment'
  | 'jobhuntDaily'
  | 'jobhuntDigest'
  | 'jobhuntSwitch'
  | 'workCommitment'
  | 'workDaily'
  | 'workDigest'
  | 'workSwitch'
  | 'quitCommitment'
  | 'quitDaily'
  | 'quitDigest'
  | 'quitSwitch'
  | 'startupCommitment'
  | 'startupDaily'
  | 'startupDigest'
  | 'startupSwitch'
  | 'closureCommitment'
  | 'closureDaily'
  | 'closureDigest'
  | 'closureSwitch';

export interface ModeConfig {
  key: EngineMode;
  label: string;
  picker: { title: string; description: string };
  onboarding: {
    msgs: string[];
    ctaQuestion: string;
    intro: string;
    afterTzPrompt: string;
    afterFocusHint: string;
    afterLogHint: string;
    afterRecapHint: string;
  };
  commitment: {
    titleQuestion: string;
    followups: Question[];
    llmPromptKey: LlmPromptKey;
    lockHint: string;
    preparingText: string;
  };
  switchFlow: {
    questions: Question[];
    llmPromptKey: LlmPromptKey;
    preparingText: string;
  };
  daily: {
    dateQuestion: string;
    skipHint: string;
    movementQuestion: string;
    branches: { yes: Question[]; no: Question[]; partial: Question[] };
    llmPromptKey: LlmPromptKey;
    preparingText: string;
    needFocusHint: string;
  };
  digest: {
    llmPromptKey: LlmPromptKey;
    preparingText: string;
    needFocusHint: string;
    needLogsHint: string;
  };
  settings: { commitLabel: string; dailyLabel: string; digestLabel: string };
  notifications: {
    focusText: string;
    logText: string;
    recapText: string;
    focusCallback: string;
    logCallback: string;
    recapCallback: string;
  };
  idleReply: string;
  card: { commitTitle: string; dailyTitle: string; digestTitle: string };
}
