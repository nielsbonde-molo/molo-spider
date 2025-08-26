import CrawlDetails from "../components/crawl-details";

export default function CrawlDetailsPage({ params }: { params: { id: string } }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <CrawlDetails crawlId={params.id} />
    </div>
  );
} 