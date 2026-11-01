let gpuInstance: any = null;

export async function initGPU() {
  if (gpuInstance) return gpuInstance;
  
  try {
    const GPU = (await import('gpu.js')).GPU;
    gpuInstance = new GPU({ mode: 'gpu' });
    console.log('GPU.js initialized successfully');
    return gpuInstance;
  } catch (e) {
    console.warn('GPU.js not available, using CPU fallback:', e);
    return null;
  }
}
