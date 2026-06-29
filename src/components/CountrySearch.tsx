import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getCountryList } from '../services/DuckDBService';

export default function CountrySearch() {
  const [query, setQuery] = useState('');
  const [countries, setCountries] = useState<{iso: string, name: string}[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    getCountryList().then(setCountries).catch(console.error);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    const q = query.trim().toLowerCase();
    const match = countries.find(c => c.iso.toLowerCase() === q || c.name.toLowerCase() === q);
    
    if (match) {
      navigate(`/country/${match.iso}`);
      setQuery('');
    } else if (q.length === 3) {
      navigate(`/country/${q.toUpperCase()}`);
      setQuery('');
    }
  };

  return (
    <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, background: 'white', borderRadius: 8, boxShadow: '0 2px 4px rgba(0,0,0,0.1)', padding: '4px 12px' }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={18} color="#64748b" />
        <input 
          placeholder="Search Country..." 
          value={query}
          onChange={e => {
            const val = e.target.value;
            setQuery(val);
            // If the typed value exactly matches a country name (e.g. they clicked it in the datalist), navigate immediately!
            const exactMatch = countries.find(c => c.name.toLowerCase() === val.trim().toLowerCase());
            if (exactMatch) {
              navigate(`/country/${exactMatch.iso}`);
              setQuery('');
            }
          }}
          list="country-list"
          style={{ border: 'none', outline: 'none', padding: '8px 0', width: 160, fontSize: '0.9rem' }} 
        />
        <datalist id="country-list">
          {countries.map(c => (
            <option key={c.iso} value={c.name} />
          ))}
        </datalist>
      </form>
    </div>
  );
}
