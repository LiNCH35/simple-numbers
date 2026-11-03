import { ref } from 'vue';

export interface ExperimentCurvePoint {
  x: number;
  avgDiff: number;
  std: number | null;
  real?: number;
  li?: number;
}

export interface ExperimentGroup {
  key: string;
  colorIndex: number;
  runs: number;
  xMaxCommon: number;
  slope: number;
  final: {
    x: number;
    real: number;
    avgDiff: number;
    std: number | null;
    relDev: number;
  };
  points: ExperimentCurvePoint[];
}

interface AnalysisGroupRaw {
  n: number;
  xMaxCommon: number;
  slope: number;
  final: {
    x: number;
    real: number;
    avgDiff: number;
    std: number | null;
    relDev: number;
  };
  curveSample: { x: number; avgDiff: number; std?: number | null; real?: number; li?: number }[];
}

interface AnalysisJsonRaw {
  generatedAt: string;
  totalRuns: number;
  groups: Record<string, AnalysisGroupRaw>;
}

export function useExperimentAnalysis() {
  const groups = ref<ExperimentGroup[]>([]);
  const generatedAt = ref('');
  const totalRuns = ref(0);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function loadAnalysis(): Promise<boolean> {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await fetch('analysis.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as AnalysisJsonRaw;
      generatedAt.value = data.generatedAt;
      groups.value = Object.entries(data.groups)
        .map(([key, group], index) => ({
          key,
          colorIndex: index,
          runs: group.n,
          xMaxCommon: group.xMaxCommon,
          slope: group.slope,
          final: group.final,
          points: group.curveSample.map((p) => ({
            x: p.x,
            avgDiff: p.avgDiff,
            std: p.std === undefined ? null : p.std,
            real: p.real,
            li: p.li
          }))
        }));
      totalRuns.value = groups.value.reduce((sum, group) => sum + group.runs, 0);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      groups.value = [];
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  return { groups, generatedAt, totalRuns, isLoading, error, loadAnalysis };
}
