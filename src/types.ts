// Shared types for Shader Visuals

export interface AudioUniforms {
  u_time: number;
  u_bass: number;
  u_mid: number;
  u_high: number;
  u_beat: number;
  u_intensity: number;
  u_resolution: [number, number];
}

export interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export interface Preset {
  name: string;
  description: string;
  source: string;
}

export interface GenerateRequest {
  scene: string;
  vibe: string;
  apiKey: string;
}

export interface AppState {
  intensity: number;
  audioActive: boolean;
  apiKey: string;
  currentPreset: string | null;
}

export type ShaderSwapCallback = (source: string) => void;
export type ErrorCallback = (message: string) => void;
