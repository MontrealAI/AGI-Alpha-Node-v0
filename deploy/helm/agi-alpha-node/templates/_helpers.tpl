{{- define "agi-alpha-node.name" -}}
{{- default .Chart.name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "agi-alpha-node.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.name .Values.nameOverride -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "agi-alpha-node.labels" -}}
helm.sh/chart: {{ include "agi-alpha-node.chart" . }}
app.kubernetes.io/name: {{ include "agi-alpha-node.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "agi-alpha-node.chart" -}}
{{- printf "%s-%s" .Chart.name .Chart.version | replace "+" "_" -}}
{{- end -}}

{{- define "agi-alpha-node.serviceAccountName" -}}
{{- if .Values.serviceAccount.name -}}
{{- .Values.serviceAccount.name -}}
{{- else -}}
{{- include "agi-alpha-node.fullname" . -}}
{{- end -}}
{{- end -}}
