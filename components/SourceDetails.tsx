import { AppIcon } from "@/components/AppIcon";
import type { SourceMeta } from "@/lib/domain/outlook";
import { formatHktDateTime, formatHktTime } from "@/lib/presentation/format";

const SOURCE_STATUS = {
  ok: "可用",
  stale: "可能已過時",
  unavailable: "暫時不可用",
} as const;

interface SourceDetailsProps {
  sources: SourceMeta[];
}

function latestPublishedAt(sources: SourceMeta[]): string | null {
  return sources.reduce<string | null>((latest, source) => {
    if (!source.publishedAt) return latest;
    if (!latest) return source.publishedAt;
    return Date.parse(source.publishedAt) > Date.parse(latest) ? source.publishedAt : latest;
  }, null);
}

export function SourceDetails({ sources }: SourceDetailsProps) {
  const availableCount = sources.filter((source) => source.status === "ok").length;
  const latestUpdate = latestPublishedAt(sources);

  return (
    <section className="source-section" aria-labelledby="source-heading">
      <details className="source-accordion">
        <summary>
          <span className="source-summary-icon" aria-hidden="true"><AppIcon name="database" /></span>
          <span className="source-summary-copy">
            <strong id="source-heading">{availableCount} 個資料來源可用</strong>
            <small>最新更新 {formatHktTime(latestUpdate)}</small>
          </span>
          <span className="source-summary-action">查看詳情<AppIcon name="chevron" /></span>
        </summary>
        <ul className="source-list">
          {sources.map((source) => (
            <li key={source.id}>
              <div>
                <a href={source.url} target="_blank" rel="noreferrer">{source.label}<span className="sr-only">（在新分頁開啟）</span></a>
                <span className="source-status" data-status={source.status}>{SOURCE_STATUS[source.status]}</span>
              </div>
              <p>{source.id === "warnings" ? "警告更新／確認" : "來源發布"}：{formatHktDateTime(source.publishedAt)}</p>
              <p>本站擷取：{formatHktDateTime(source.retrievedAt)}</p>
              {source.issues.length > 0 ? <p className="source-issue">部分欄位未能讀取（{source.issues.length} 項），未有虛構代替值。</p> : null}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
