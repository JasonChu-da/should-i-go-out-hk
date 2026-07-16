import type { SourceMeta } from "@/lib/domain/outlook";
import { formatHktDateTime } from "@/lib/presentation/format";

const SOURCE_STATUS = {
  ok: "可用",
  stale: "可能已過時",
  unavailable: "暫時不可用",
} as const;

interface SourceDetailsProps {
  sources: SourceMeta[];
}

export function SourceDetails({ sources }: SourceDetailsProps) {
  return (
    <section className="source-section" aria-labelledby="source-heading">
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">透明資料</p>
          <h2 id="source-heading">來源與更新時間</h2>
        </div>
      </div>
      <ul className="source-list">
        {sources.map((source) => (
          <li key={source.id}>
            <div>
              <a href={source.url} target="_blank" rel="noreferrer">{source.label}<span className="sr-only">（在新分頁開啟）</span></a>
              <span className="source-status" data-status={source.status}>{SOURCE_STATUS[source.status]}</span>
            </div>
            <p>{source.id === "warnings" ? "警告更新／確認" : "來源發布"}：{formatHktDateTime(source.publishedAt)} · 本站擷取：{formatHktDateTime(source.retrievedAt)}</p>
            {source.issues.length > 0 ? <p className="source-issue">部分欄位未能讀取（{source.issues.length} 項），未有虛構代替值。</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
