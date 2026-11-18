#!/usr/bin/env bash
# TRELLIS character pipeline:
#   Download -> Validate -> Identify -> Import/Inspect -> Render baseline (Set A)
#   -> Refine (master) -> Render enhanced (Set B) -> Rig/Optimize/Export (runtime)
#   -> Test (export re-import, segment QA) -> Report
#
# Usage: tools/trellis/run_pipeline.sh [character ...]     (default: all four)
# Env:   BLENDER=/path/to/blender (4.2 LTS+), FORCE=1 to re-run up-to-date stages,
#        SAMPLES=128 studio samples, SKIP_RENDERS=1 to skip Set A/B renders.
# Stages are skipped when the source checksum is unchanged; a failed stage stops
# that character's later stages and is reported at the end; re-run to resume.
set -uo pipefail
cd "$(dirname "$0")/../.."
BLENDER=${BLENDER:-blender}
T=tools/trellis
CHARS=("$@")
[ ${#CHARS[@]} -eq 0 ] && CHARS=(lifeline vanguard wraith bathysphere)
failed=()

python3 $T/download.py || failed+=(download)
$BLENDER -b -P $T/inspect_sources.py > $T/reports/inspect.log 2>&1 || failed+=(inspect)
python3 $T/identify.py > $T/reports/identify.log 2>&1 || { echo "Identification ambiguous: see $T/reports/identification.json"; exit 2; }

for c in "${CHARS[@]}"; do
  stages=(master runtime)
  [ -z "${SKIP_RENDERS:-}" ] && stages=(baseline master enhanced runtime)
  for st in "${stages[@]}"; do
    if ! $BLENDER -b -P $T/process.py -- "$st" "$c" >> $T/reports/pipeline_blender.log 2>&1; then
      failed+=("$c:$st"); break
    fi
  done
done
$BLENDER -b -P $T/verify_export.py -- "${CHARS[@]}" >> $T/reports/pipeline_blender.log 2>&1 || failed+=(verify)
$BLENDER -b -P $T/qa/segments.py -- "${CHARS[@]}" >> $T/reports/pipeline_blender.log 2>&1 || failed+=(segments)
python3 $T/report.py || failed+=(report)

if [ ${#failed[@]} -gt 0 ]; then
  echo "Failed stages: ${failed[*]} (details in $T/reports/pipeline.log)"; exit 1
fi
echo "Pipeline complete. Report: $T/reports/REPORT.md"
