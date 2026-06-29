import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Plus, Trash2, Map as MapIcon, FileText, Edit2, Save } from 'lucide-react';
import { getCountryDocuments, addCountryDocument, deleteCountryDocument, updateCountryDocument } from '../services/firebase';
import type { CountryDocument } from '../services/firebase';
import { getCountryList } from '../services/DuckDBService';

export default function NationalDashboard() {
  const { iso } = useParams<{ iso: string }>();
  const navigate = useNavigate();
  
  const [docs, setDocs] = useState<CountryDocument[]>([]);
  const [countryName, setCountryName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', mapUrl: '', reportUrl: '' });
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({ title: '', description: '', mapUrl: '', reportUrl: '' });

  useEffect(() => {
    if (!iso) return;
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

  if (!iso) return null;

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, width: 400, height: '100vh', background: 'white', zIndex: 50, boxShadow: '-4px 0 15px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 20, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, color: '#0f172a' }}>{countryName || iso} Dashboard</h2>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#64748b" /></button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {loading && <p style={{ color: '#64748b' }}>Loading documents...</p>}
        
        {!loading && docs.length === 0 && (
          <p style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>No national documents found for {iso}.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
              {editingId === doc.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={editFormData.title} onChange={e => setEditFormData({...editFormData, title: e.target.value})} style={{ padding: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontWeight: 'bold' }} />
                  <textarea value={editFormData.description} onChange={e => setEditFormData({...editFormData, description: e.target.value})} style={{ padding: 4, borderRadius: 4, border: '1px solid #cbd5e1', minHeight: 40 }} />
                  <input placeholder="Map URL" value={editFormData.mapUrl} onChange={e => setEditFormData({...editFormData, mapUrl: e.target.value})} style={{ padding: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />
                  <input placeholder="Report URL" value={editFormData.reportUrl} onChange={e => setEditFormData({...editFormData, reportUrl: e.target.value})} style={{ padding: 4, borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={() => handleUpdate(doc.id)} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4 }}><Save size={14} /> Save</button>
                    <button onClick={() => setEditingId(null)} style={{ flex: 1, background: 'transparent', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#0f172a' }}>{doc.title}</h3>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => startEdit(doc)} style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', padding: 2 }}><Edit2 size={16} /></button>
                      <button onClick={() => handleDelete(doc.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 12px 0', color: '#475569', fontSize: '0.9rem' }}>{doc.description}</p>
                  
                  <div style={{ display: 'flex', gap: 12 }}>
                    {doc.mapUrl && <a href={doc.mapUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#0ea5e9', textDecoration: 'none', fontSize: '0.85rem' }}><MapIcon size={14} /> View Map</a>}
                    {doc.reportUrl && <a href={doc.reportUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#8b5cf6', textDecoration: 'none', fontSize: '0.85rem' }}><FileText size={14} /> Open Report</a>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 20, borderTop: '1px solid #eee', background: '#f8fafc' }}>
        {!showForm ? (
          <button onClick={() => setShowForm(true)} style={{ width: '100%', padding: '12px', background: '#10b981', color: 'white', border: 'none', borderRadius: 8, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
            <Plus size={18} /> Add National Data
          </button>
        ) : (
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input required placeholder="Document Title" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} style={{ padding: 8, borderRadius: 4, border: '1px solid #cbd5e1' }} />
            <textarea placeholder="Description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} style={{ padding: 8, borderRadius: 4, border: '1px solid #cbd5e1', minHeight: 60 }} />
            <input placeholder="Map URL (Optional)" value={formData.mapUrl} onChange={e => setFormData({...formData, mapUrl: e.target.value})} style={{ padding: 8, borderRadius: 4, border: '1px solid #cbd5e1' }} />
            <input placeholder="Report URL (Optional)" value={formData.reportUrl} onChange={e => setFormData({...formData, reportUrl: e.target.value})} style={{ padding: 8, borderRadius: 4, border: '1px solid #cbd5e1' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: 8, background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={loading} style={{ flex: 1, padding: 8, background: '#10b981', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Save</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
