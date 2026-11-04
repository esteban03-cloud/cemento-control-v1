import { Link } from 'react-router-dom';
import { ArrowLeft, MapPinOff } from 'lucide-react';
import { BrandMark } from '../components/Brand.jsx';

export default function NotFound() {
  return (
    <div className="not-found">
      <BrandMark size={54} />
      <span className="eyebrow">Error 404</span>
      <h1>Esta página se fue en el camión.</h1>
      <p>La dirección que buscas no existe o cambió de lugar. Vuelve al panel para retomar la operación.</p>
      <Link to="/" className="btn btn-primary"><ArrowLeft size={16} /> Volver al panel</Link>
    </div>
  );
}
