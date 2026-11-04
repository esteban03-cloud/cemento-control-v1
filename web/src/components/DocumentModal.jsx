import { useRef, useState } from 'react';
import { Download, FileImage, FileText, Loader2 } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { CompanyLogo } from './Brand.jsx';
import { StatusBadge } from './DataDisplay.jsx';
import { classNames, formatDate, formatDateTime, sanitizeFilename } from '../utils.js';

export function DocumentModal({
  open,
  onClose,
  kind,
  number,
  date,
  status,
  children,
  fileName,
  subtitle
}) {
  const { business } = useAuth();
  const toast = useToast();
  const sheetRef = useRef(null);
  const [exporting, setExporting] = useState(null);

  const capture = async () => {
    const source = sheetRef.current;
    if (!source) return null;

    // Espera las fuentes y las imágenes antes de medir el documento.
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all(Array.from(source.querySelectorAll('img')).map(async (img) => {
      if (img.complete) return;
      try { await img.decode(); } catch { /* La imagen no debe bloquear la exportación. */ }
    }));

    const node = source.cloneNode(true);
    const copyComputedStyles = (original, clone) => {
      const computed = window.getComputedStyle(original);
      for (const property of computed) {
        clone.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
      }
      Array.from(original.children).forEach((child, index) => {
        const clonedChild = clone.children[index];
        if (clonedChild) copyComputedStyles(child, clonedChild);
      });
    };
    copyComputedStyles(source, node);

    // El documento se renderiza fuera del modal para evitar desplazamientos
    // causados por transformaciones, scroll y contenedores con overflow.
    Object.assign(node.style, {
      width: '800px',
      minWidth: '800px',
      maxWidth: '800px',
      minHeight: '0',
      margin: '0',
      padding: '36px 40px',
      position: 'fixed',
      left: '-10000px',
      top: '0',
      zIndex: '-1',
      pointerEvents: 'none',
      boxShadow: 'none',
      transform: 'none',
      backgroundColor: '#ffffff',
      boxSizing: 'border-box',
      letterSpacing: 'normal',
      fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif'
    });
    node.classList.add('document-export-mode');
    document.body.appendChild(node);

    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        width: 800,
        windowWidth: 1000,
        windowHeight: Math.max(1200, node.scrollHeight + 100),
        scrollX: 0,
        scrollY: 0,
        removeContainer: true,
        onclone: (clonedDoc) => {
          const exportNode = clonedDoc.querySelector('.document-export-mode');
          if (!exportNode) return;
          exportNode.style.left = '0';
          exportNode.style.top = '0';
          exportNode.style.zIndex = 'auto';
          exportNode.style.transform = 'none';
          exportNode.style.letterSpacing = 'normal';
          exportNode.style.wordSpacing = 'normal';
          exportNode.style.fontFamily = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
        }
      });
      return canvas;
    } finally {
      node.remove();
    }
  };

  const safeName = sanitizeFilename(fileName || `${kind}-${number || 'registro'}`);
  const downloadPng = async () => {
    setExporting('png');
    try {
      const canvas = await capture();
      if (!canvas) return;
      const anchor = document.createElement('a');
      anchor.href = canvas.toDataURL('image/png');
      anchor.download = `${safeName}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      toast.success('Imagen PNG descargada correctamente.');
    } catch (error) {
      console.error(error);
      toast.error('No se pudo generar la imagen. Intenta de nuevo.');
    } finally {
      setExporting(null);
    }
  };

  const downloadPdf = async () => {
    setExporting('pdf');
    try {
      const canvas = await capture();
      if (!canvas) return;
      const { jsPDF } = await import('jspdf');
      const width = canvas.width;
      const height = canvas.height;
      const pdf = new jsPDF({
        orientation: width > height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [width, height],
        hotfixes: ['px_scaling']
      });
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height, undefined, 'FAST');
      pdf.save(`${safeName}.pdf`);
      toast.success('Documento PDF descargado correctamente.');
    } catch (error) {
      console.error(error);
      toast.error('No se pudo generar el PDF. Intenta de nuevo.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${kind} ${number || ''}`.trim()}
      subtitle={subtitle}
      size="xl"
      className="document-modal"
      footer={(
        <div className="document-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <div className="document-downloads">
            <button type="button" className="btn btn-secondary" onClick={downloadPng} disabled={Boolean(exporting)}>
              {exporting === 'png' ? <Loader2 size={16} className="spin" /> : <FileImage size={16} />}
              {exporting === 'png' ? 'Generando…' : 'PNG'}
            </button>
            <button type="button" className="btn btn-primary" onClick={downloadPdf} disabled={Boolean(exporting)}>
              {exporting === 'pdf' ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
              {exporting === 'pdf' ? 'Generando…' : 'Descargar PDF'}
            </button>
          </div>
        </div>
      )}
    >
      <div className="document-stage">
        <article className="document-sheet" ref={sheetRef}>
          <header className="document-header">
            <div className="document-brand">
              <CompanyLogo business={business} size={48} />
              <div>
                <h2>{business?.name || 'CementoControl'}</h2>
                <p>NIT {business?.nit || '—'} · {business?.phone || ''}</p>
                <p>{business?.address || ''} · {business?.city || ''}</p>
                <p>{business?.email || ''}</p>
              </div>
            </div>
            <div className="document-type">
              <span className="document-kicker">{kind.toUpperCase()}</span>
              <strong>{number || '—'}</strong>
              {status && <StatusBadge status={status} />}
              <small>{formatDate(date, { long: true })}</small>
            </div>
          </header>
          <div className="document-rule" />
          {children}
          <footer className="document-footer">
            <div>
              <span>Documento generado por CementoControl</span>
              <small>{formatDateTime(new Date().toISOString())} · Colombia (UTC−5)</small>
            </div>
            <Download size={15} aria-hidden="true" />
          </footer>
        </article>
      </div>
    </Modal>
  );
}

export function DocumentSection({ title, children, className }) {
  return (
    <section className={classNames('document-section', className)}>
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

export function DocumentFacts({ items = [], columns = 2 }) {
  return (
    <div className={classNames('document-facts', `cols-${columns}`)}>
      {items.map((item) => (
        <div className="document-fact" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value ?? '—'}</strong>
        </div>
      ))}
    </div>
  );
}

export function DocumentItems({ columns = [], rows = [], totalRow }) {
  return (
    <div className="document-table-wrap">
      <table className="document-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key} className={column.align ? `align-${column.align}` : ''}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((column) => (
                <td key={column.key} className={column.align ? `align-${column.align}` : ''}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totalRow && (
          <tfoot>
            <tr>{columns.map((column, index) => <td key={column.key} className={column.align ? `align-${column.align}` : ''}>{index === 0 ? totalRow.label : totalRow.values?.[index] ?? ''}</td>)}</tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function DocumentTotals({ items = [], note }) {
  return (
    <div className="document-summary-block">
      <div className="document-summary">
        {items.map((item) => (
          <div key={item.label} className={classNames('document-summary-row', item.strong && 'strong', item.tone && `tone-${item.tone}`)}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      {note && <p className="document-note">{note}</p>}
    </div>
  );
}

export function DocumentPayments({ payments = [], columns }) {
  if (!payments.length) return null;
  return (
    <DocumentSection title="Abonos registrados">
      <DocumentItems columns={columns} rows={payments} />
    </DocumentSection>
  );
}
