import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { ReadingSpirit } from "../../components/Brand";

export function LibraryEmptyState({ filtered, onClearFilters }: { filtered?: boolean; onClearFilters?: () => void }) {
  return <div className="yomi-route-empty"><div>
    <ReadingSpirit mood="resting" className="yomi-empty-spirit" />
    <h2>{filtered ? "No books found" : "Your next story starts here"}</h2>
    <p>{filtered ? "Try another search or choose a different collection." : "Find something you love, add it to your library, and make yourself at home."}</p>
    {filtered ? <button className="yomi-button yomi-button-secondary mt-5" onClick={onClearFilters}>Clear filters</button> : <Link to="/browse/sources" className="yomi-button yomi-button-primary mt-5"><Compass />Discover books</Link>}
  </div></div>;
}
