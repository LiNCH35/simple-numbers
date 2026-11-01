declare module 'gpu.js' {
  export interface GPUOptions {
    mode?: 'gpu' | 'cpu' | 'webgl' | 'webgl2';
    canvas?: HTMLCanvasElement;
    webgl?: WebGLRenderingContext;
    context?: WebGL2RenderingContext;
  }

  export class GPU {
    constructor(options?: GPUOptions);
    createKernel(fn: Function): GPUKernel;
    createKernel(fn: Function, settings?: any): GPUKernel;
  }

  export class GPUKernel {
    setConstants(constants: Record<string, any>): GPUKernel;
    setOutput(output: number[]): GPUKernel;
    setOutput(output: number[] | number[][]): GPUKernel;
    setGraphical(flag: boolean): GPUKernel;
    setPrecision(precision: 'single' | 'unsigned' | 'binary'): GPUKernel;
    setTactic(tactic: 'speed' | 'balanced' | 'precision'): GPUKernel;
  }

  export interface GPUKernel {
    (...args: any[]): any;
  }
}
