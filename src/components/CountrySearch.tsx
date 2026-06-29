import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getCountryList } from '../services/DuckDBService';

export default function CountrySearch() {
  const [query, setQuery] = useState('');
  const [countries, setCountries] = useState<{iso: string, name: string}[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getCountryList().then(setCountries).catch(console.error);
    
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCountries = query.trim() === '' 
    ? [] 
    : countries.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

  const handleSelect = (iso: string) => {
    setQuery('');
    setIsOpen(false);
    navigate(`/country/${iso}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    
    // Exact match by name or ISO
    const match = countries.find(c => c.iso.toLowerCase() === q || c.name.toLowerCase() === q);
    if (match) {
      handleSelect(match.iso);
    } else if (q.length === 3) {
      handleSelect(q.toUpperCase());
    } else if (filteredCountries.length > 0) {
      // Just pick the first one if they press enter
      handleSelect(filteredCountries[0].iso);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', marginBottom: '24px' }}>
      <div style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', padding: '6px 12px' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search size={18} color="#94a3b8" />
          <input 
            placeholder="Search Country..." 
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.length > 0) setIsOpen(true);
            }}
            style={{ border: 'none', outline: 'none', background: 'transparent', color: 'white', padding: '8px 0', width: '100%', fontSize: '0.9rem' }} 
          />
        </form>
      </div>

      {isOpen && filteredCountries.length > 0 && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          backdropFilter: 'blur(10px)',
          listStyle: 'none',
          padding: '4px 0',
          margin: '4px 0 0 0',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 50,
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
        }}>
          {filteredCountries.map(c => (
            <li 
              key={c.iso}
              onClick={() => handleSelect(c.iso)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                color: '#f8fafc',
                fontSize: '0.9rem',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
