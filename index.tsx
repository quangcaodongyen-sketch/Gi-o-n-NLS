
import React, { useState, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import PizZip from "pizzip";
import * as FileSaverModule from "file-saver";
import { 
  FileUp, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Download, 
  Loader2, 
  ShieldCheck, 
  ChevronRight, 
  Settings, 
  Layers, 
  Globe,
  Sparkles,
  Key
} from 'lucide-react';

const saveAs = (FileSaverModule as any).saveAs || (FileSaverModule as any).default || FileSaverModule;

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const NLS_MAPPING_RULES = `
BẠN LÀ TRỢ LÝ AI CHUYÊN BỔ SUNG NĂNG LỰC SỐ (NLS) CHO GIÁO ÁN BỘ SÁCH "KẾT NỐI TRI THỨC VỚI CUỘC SỐNG", "GLOBAL SUCCESS" VÀ TẤT CẢ CÁC BỘ SÁCH GIÁO KHOA KHÁC.

QUY TẮC NGÔN NGỮ:
- Nếu giáo án có Tiếng Anh (Unit, Lesson, Objectives...), viết NLS bằng TIẾNG ANH: "Digital Competence: [content] ([code], [criteria])".
- Nếu giáo án Tiếng Việt, viết: "Năng lực số: [nội dung] ([mã nls], [mã tc])".

QUY TẮC ĐỊNH DẠNG:
1. Mã NLS/TC theo CV 3456/BGDĐT.
2. Không in đậm, không ký hiệu đầu dòng, viết hoa chữ cái đầu.
3. Chèn ngay dưới mục tiêu hoạt động.
`;

interface NLSAddition {
  searchText: string;
  nlsContent: string;
  location: string;
}

const extractTextFromDocx = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as ArrayBuffer;
        const zip = new PizZip(content);
        const xml = zip.files["word/document.xml"].asText();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, "text/xml");
        const paragraphs = xmlDoc.getElementsByTagName("w:p");
        let text = "";
        for (let i = 0; i < paragraphs.length; i++) {
          text += (paragraphs[i].textContent || "") + "\n";
        }
        resolve(text);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Lỗi khi đọc file Word."));
    reader.readAsArrayBuffer(file);
  });
};

const patchDocxWithNLS = async (file: File, additions: NLSAddition[]): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as ArrayBuffer;
        const zip = new PizZip(content);
        const xml = zip.files["word/document.xml"].asText();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, "text/xml");
        const paragraphs = Array.from(xmlDoc.getElementsByTagName("w:p"));

        additions.forEach(add => {
          const targetPara = paragraphs.find(p => p.textContent?.trim().includes(add.searchText.trim()));
          if (targetPara) {
            const newPara = xmlDoc.createElementNS(WORD_NS, "w:p");
            const targetPPr = targetPara.getElementsByTagName("w:pPr")[0];
            const newPPr = targetPPr ? targetPPr.cloneNode(true) : xmlDoc.createElementNS(WORD_NS, "w:pPr");
            const numPr = (newPPr as Element).getElementsByTagName("w:numPr")[0];
            if (numPr) { newPPr.removeChild(numPr); }
            newPara.appendChild(newPPr);

            const r = xmlDoc.createElementNS(WORD_NS, "w:r");
            let newRPr: Node;
            const targetRuns = targetPara.getElementsByTagName("w:r");
            if (targetRuns.length > 0) {
              const firstRPr = targetRuns[0].getElementsByTagName("w:rPr")[0];
              newRPr = firstRPr ? firstRPr.cloneNode(true) : xmlDoc.createElementNS(WORD_NS, "w:rPr");
            } else {
              newRPr = xmlDoc.createElementNS(WORD_NS, "w:rPr");
            }

            let color = (newRPr as Element).getElementsByTagName("w:color")[0];
            if (!color) {
              color = xmlDoc.createElementNS(WORD_NS, "w:color");
              newRPr.appendChild(color);
            }
            color.setAttributeNS(WORD_NS, "w:val", "FF0000");
            
            r.appendChild(newRPr);
            const t = xmlDoc.createElementNS(WORD_NS, "w:t");
            t.setAttribute("xml:space", "preserve");
            t.textContent = "\t" + add.nlsContent;
            r.appendChild(t);
            newPara.appendChild(r);

            if (targetPara.nextSibling) {
              targetPara.parentNode?.insertBefore(newPara, targetPara.nextSibling);
            } else {
              targetPara.parentNode?.appendChild(newPara);
            }
          }
        });

        const serializer = new XMLSerializer();
        const newXml = serializer.serializeToString(xmlDoc);
        zip.file("word/document.xml", newXml);
        resolve(zip.generate({ type: "blob" }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Lỗi khi xử lý file."));
    reader.readAsArrayBuffer(file);
  });
};

const App = () => {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState('Chuẩn');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const [customKey, setCustomKey] = useState(sessionStorage.getItem('GEMINI_KEY') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getActiveApiKey = () => {
    return customKey || process.env.API_KEY || (window as any).process?.env?.API_KEY;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.name.endsWith('.docx')) {
      setFile(selected);
      setError(null);
      setStep(2);
    } else {
      setError("Vui lòng tải file giáo án .docx");
    }
  };

  // Fix: Added missing downloadResults function
  const downloadResults = () => {
    if (result && file) {
      const fileName = file.name.replace('.docx', '_NLS_TichHop.docx');
      saveAs(result, fileName);
    }
  };

  const processLessonPlan = async () => {
    const apiKey = getActiveApiKey();
    if (!apiKey || apiKey.length < 10) {
      setShowKeyInput(true);
      setError("Vui lòng nhập API Key để tiếp tục.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStep(3);

    try {
      // Khởi tạo AI trực tiếp trước khi dùng theo chuẩn kỹ thuật
      const ai = new GoogleGenAI({ apiKey });
      const docText = await extractTextFromDocx(file!);

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `PHÂN TÍCH GIÁO ÁN VÀ BỔ SUNG NLS: ${NLS_MAPPING_RULES}\nMức độ: ${level}\nNội dung:\n${docText.substring(0, 15000)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              additions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    searchText: { type: Type.STRING },
                    nlsContent: { type: Type.STRING }
                  },
                  required: ["searchText", "nlsContent"]
                }
              }
            }
          }
        }
      });

      const data = JSON.parse(response.text || '{}');
      if (!data.additions || data.additions.length === 0) throw new Error("Không tìm thấy vị trí chèn phù hợp.");
      
      const patchedDocx = await patchDocxWithNLS(file!, data.additions);
      setResult(patchedDocx);
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối AI.");
      setStep(2);
    } finally {
      setIsProcessing(false);
    }
  };

  const saveKey = () => {
    if (customKey.length > 10) {
      sessionStorage.setItem('GEMINI_KEY', customKey);
      setShowKeyInput(false);
      setError(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="gradient-bg text-white py-10 shadow-2xl px-6 relative overflow-hidden">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="bg-white/10 p-4 rounded-3xl backdrop-blur-xl border border-white/20">
              <Sparkles size={32} className="text-yellow-300" />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight">GIÁO ÁN TÍCH HỢP <span className="text-yellow-300">NLS</span></h1>
              <p className="text-blue-100 font-medium opacity-80">Trợ lý AI Năng lực số chuẩn 3456</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="bg-black/20 px-6 py-3 rounded-2xl border border-white/10 flex items-center gap-3">
              <ShieldCheck size={18} className="text-green-300" />
              <span className="text-sm font-bold">Đinh Thành: 0915.213717</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full px-6 py-12 flex-grow">
        {showKeyInput && (
          <div className="mb-10 bg-yellow-50 border-2 border-yellow-200 p-8 rounded-[2.5rem] shadow-xl animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-4 mb-6 text-yellow-800 font-black text-xl">
              <Key size={28} /> CẤU HÌNH API KEY (DÀNH CHO VERCEL)
            </div>
            <p className="text-yellow-700 mb-6 font-medium">Vì lý do bảo mật của Vercel, vui lòng dán API Key Gemini của bạn vào đây (Key sẽ được lưu tạm trong phiên làm việc này).</p>
            <div className="flex gap-4">
              <input 
                type="password" 
                value={customKey} 
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="Dán API Key tại đây..."
                className="flex-grow bg-white border-2 border-yellow-300 px-6 py-4 rounded-2xl focus:outline-none focus:ring-4 ring-yellow-200 font-mono"
              />
              <button onClick={saveKey} className="bg-yellow-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-yellow-700 transition-all">LƯU KEY</button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center mb-12 max-w-xs mx-auto">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black transition-all ${step >= s ? 'bg-blue-600 text-white shadow-lg' : 'bg-white text-slate-300 border-2 border-slate-100'}`}>{s}</div>
              {s < 3 && <div className={`h-1 flex-grow mx-2 rounded-full ${step > s ? 'bg-blue-600' : 'bg-slate-200'}`}></div>}
            </React.Fragment>
          ))}
        </div>

        {step === 1 && (
          <div onClick={() => fileInputRef.current?.click()} className="bg-white rounded-[3rem] p-16 border-4 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer flex flex-col items-center group shadow-xl">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".docx" />
            <div className="bg-blue-600 p-10 rounded-full mb-8 group-hover:scale-110 transition-all shadow-xl shadow-blue-200">
              <FileUp size={48} className="text-white" />
            </div>
            <h3 className="text-3xl font-black text-slate-800 mb-4">Tải giáo án .docx</h3>
            <p className="text-slate-500 font-bold">Hệ thống sẽ tự động chèn NLS chuẩn 3456</p>
            {error && <div className="mt-8 text-red-600 font-bold bg-red-50 px-6 py-4 rounded-2xl border border-red-100 flex items-center gap-2"><AlertCircle size={20} /> {error}</div>}
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-[3rem] p-10 shadow-xl border border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              {['Cơ bản', 'Chuẩn', 'Mở rộng'].map(l => (
                <button key={l} onClick={() => setLevel(l)} className={`py-6 px-4 rounded-2xl font-black text-lg transition-all border-2 ${level === l ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-slate-50 text-slate-400 border-transparent hover:bg-slate-100'}`}>{l}</button>
              ))}
            </div>
            {error && <div className="mb-8 text-red-600 font-bold bg-red-50 px-6 py-4 rounded-2xl border border-red-100 flex items-center gap-2"><AlertCircle size={20} /> {error}</div>}
            <div className="flex flex-col md:flex-row items-center gap-6 justify-between pt-8 border-t border-slate-50">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 w-full md:w-auto">
                 <FileText className="text-blue-500" />
                 <span className="font-bold truncate max-w-[150px]">{file?.name}</span>
                 <button onClick={() => setStep(1)} className="text-blue-600 font-black text-sm ml-2 underline">ĐỔI</button>
              </div>
              <button onClick={processLessonPlan} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-12 py-6 rounded-2xl font-black text-xl flex items-center justify-center gap-4 shadow-xl active:scale-95 transition-all">BẮT ĐẦU XỬ LÝ <ChevronRight /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white rounded-[3.5rem] p-12 shadow-xl border border-slate-100 flex flex-col items-center text-center">
            {!result ? (
              <>
                <div className="relative mb-10">
                  <div className="bg-blue-50 p-12 rounded-full border-4 border-white shadow-lg"><Loader2 size={64} className="text-blue-600 animate-spin" /></div>
                </div>
                <h3 className="text-3xl font-black text-slate-900 mb-6 italic animate-pulse">AI đang phân tích và chèn NLS...</h3>
                <div className="space-y-4 w-full max-w-xs">
                  <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-2xl text-blue-700 font-bold text-sm"><Globe size={20} /> Kiểm tra ngôn ngữ</div>
                  <div className="flex items-center gap-4 p-4 bg-green-50 rounded-2xl text-green-700 font-bold text-sm"><ShieldCheck size={20} /> Áp dụng CV 3456</div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-100 p-10 rounded-full mb-8 shadow-inner border-4 border-white"><CheckCircle2 size={64} className="text-green-600" /></div>
                <h3 className="text-4xl font-black text-slate-900 mb-4 uppercase">HOÀN TẤT!</h3>
                <p className="text-slate-500 mb-10 font-bold text-xl italic">Giáo án của bạn đã sẵn sàng với NLS tích hợp.</p>
                <div className="flex flex-col md:flex-row gap-6 w-full justify-center">
                  <button onClick={downloadResults} className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-6 rounded-2xl font-black text-xl flex items-center justify-center gap-4 shadow-xl active:scale-95 transition-all"><Download size={24} /> TẢI GIÁO ÁN MỚI</button>
                  <button onClick={() => { setFile(null); setResult(null); setStep(1); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-8 py-6 rounded-2xl font-black text-lg transition-all">LÀM FILE KHÁC</button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="py-12 bg-white border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-6 text-center text-slate-300 font-black uppercase tracking-widest text-sm">
          AI Education Assistant - Digital Competence Integration
        </div>
      </footer>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
