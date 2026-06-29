import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Map as MapIcon, FileText, Edit2, Save, Globe, FileStack, Database } from 'lucide-react';
import { getCountryDocuments, addCountryDocument, deleteCountryDocument, updateCountryDocument } from '../services/firebase';
import type { CountryDocument } from '../services/firebase';
import { getCountryList } from '../services/DuckDBService';

export default function DashboardPanel() {
  const { iso } = useParams<{ iso: string }>();
  const navigate = useNavigate();
  
  const [docs, setDocs] = useState<CountryDocument[]>([]);
  const [countryName, setCountryName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', mapUrl: '', reportUrl: '' });
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({ title: '', description: '', mapUrl: '', reportUrl: '' });

  useEffect(() => {
    if (!iso) {
      setCountryName("Global");
      setDocs([]); 
      return;
    }

    setLoading(true);
    getCountryDocuments(iso).then(data => {
      setDocs(data);
      setLoading(false);
    });
    
    getCountryList().then(list => {
      const match = list.find(c => c.iso === iso);
      if (match) setCountryName(match.name);
    });
  }, [iso]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!iso || !formData.title) return;
    
    setLoading(true);
    const newDoc = await addCountryDocument(iso, formData);
    setDocs([...docs, newDoc]);
    setFormData({ title: '', description: '', mapUrl: '', reportUrl: '' });
    setShowForm(false);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!iso) return;
    if (!window.confirm('Are you sure you want to delete this national data entry?')) return;
    setLoading(true);
    await deleteCountryDocument(iso, id);
    setDocs(docs.filter(d => d.id !== id));
    setLoading(false);
  };

  const startEdit = (doc: CountryDocument) => {
    setEditingId(doc.id);
    setEditFormData({ title: doc.title, description: doc.description || '', mapUrl: doc.mapUrl || '', reportUrl: doc.reportUrl || '' });
  };

  const handleUpdate = async (id: string) => {
    if (!iso) return;
    setLoading(true);
    await updateCountryDocument(iso, id, editFormData);
    setDocs(docs.map(d => d.id === id ? { ...d, ...editFormData } : d));
    setEditingId(null);
    setLoading(false);
  };

  return (
    <div className="panel-section" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem' }}>
          {iso ? <MapIcon size={18} color="#10b981" /> : <Globe size={18} color="#10b981" />}
          {countryName || iso || "Global"} Statistics
        </h2>
        {iso && (
          <button 
            onClick={() => navigate('/')} 
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#cbd5e1', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}
          >
            Clear View
          </button>
        )}
      </div>

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: 12 }}>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 16px 0' }}>
          {iso 
            ? `SQL statistics for ${countryName || iso} will appear here.` 
            : 'Viewing global statistics. Select a country to view national data.'}
        </p>

        {/* Firebase Documents Section */}
        {iso && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileStack size={16} /> National Documents
            </h3>
            
            {loading && <p style={{ color: '#64748b', fontSize: '0.8rem' }}>Loading documents...</p>}
            {!loading && docs.length === 0 && (
              <p style={{ color: '#64748b', fontSize: '0.8rem' }}>No documents found.</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
              {docs.map(doc => (
                <div key={doc.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: 12 }}>
                  {editingId === doc.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} style={{ padding: 4, borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: 'white' }} />
                      <textarea value={editFormData.description} onChange={e => setEditFormData({...editFormData, description: e.target.value})} style={{ padding: 4, borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: 'white', minHeight: 40 }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleUpdate(doc.id)} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '4px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}><Save size={12} /> Save</button>
                        <button onClick={() => setEditingId(null)} style={{ flex: 1, background: 'transparent', color: '#fff', border: '1px solid #475569', padding: '4px', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#f8fafc' }}>{doc.title}</h4>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => startEdit(doc)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 2 }}><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(doc.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <p style={{ margin: '0 0 8px 0', color: '#cbd5e1', fontSize: '0.8rem' }}>{doc.description}</p>
                      
                      <div style={{ display: 'flex', gap: 12 }}>
                        {doc.mapUrl && <a href={doc.mapUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#38bdf8', textDecoration: 'none', fontSize: '0.75rem' }}><MapIcon size={12} /> Map</a>}
                        {doc.reportUrl && <a href={doc.reportUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#a78bfa', textDecoration: 'none', fontSize: '0.75rem' }}><FileText size={12} /> Report</a>}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {!showForm ? (
              <button onClick={() => setShowForm(true)} style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: 6, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.8rem' }}>
                <Plus size={14} /> Add Document
              </button>
            ) : (
              <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 6 }}>
                <input required placeholder="Title" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} style={{ padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: 'white', fontSize: '0.8rem' }} />
                <textarea placeholder="Description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: 'white', fontSize: '0.8rem', minHeight: 40 }} />
                <input placeholder="Map URL" value={formData.mapUrl} onChange={e => setFormData({...formData, mapUrl: e.target.value})} style={{ padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: 'white', fontSize: '0.8rem' }} />
                <input placeholder="Report URL" value={formData.reportUrl} onChange={e => setFormData({...formData, reportUrl: e.target.value})} style={{ padding: 6, borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: 'white', fontSize: '0.8rem' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: 6, background: 'transparent', color: 'white', border: '1px solid #475569', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                  <button type="submit" disabled={loading} style={{ flex: 1, padding: 6, background: '#10b981', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
