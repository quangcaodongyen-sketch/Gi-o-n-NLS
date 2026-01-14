
import React, { useState, useRef } from 'react';
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
  Sparkles
} from 'lucide-react';

const saveAs = (FileSaverModule as any).saveAs || (FileSaverModule as any).default || FileSaverModule;

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const NLS_MAPPING_RULES = `
BẠN LÀ TRỢ LÝ AI CHUYÊN BỔ SUNG NĂNG LỰC SỐ (NLS) CHO GIÁO ÁN BỘ SÁCH "KẾT NỐI TRI THỨC VỚI CUỘC SỐNG", "GLOBAL SUCCESS" VÀ TẤT CẢ CÁC BỘ SÁCH GIÁO KHOA KHÁC.

QUY TẮC NGÔN NGỮ QUAN TRỌNG:
- KIỂM TRA NỘI DUNG GIÁO ÁN: Nếu giáo án có tiêu đề, nội dung hoặc các phần bằng Tiếng Anh (Ví dụ: Unit, Lesson, Objectives, Warm-up, Global Success...), BẮT BUỘC viết nội dung NLS bằng TIẾNG ANH.
- Cấu trúc Tiếng Anh: "Digital Competence: [content] ([code], [criteria])".
- Cấu trúc Tiếng Việt: "Năng lực số: [nội dung] ([mã nls], [mã tc])".

QUY TẮC NỘI DUNG & ĐỊNH DẠNG:
1. Mã NLS và TC ghi theo CV 3456/BGDĐT (NLS1, NLS2, TC1a...).
2. KHÔNG SỬ DỤNG KÝ HIỆU ĐẦU DÒNG.
3. QUY TẮC VIẾT HOA: Viết hoa chữ cái đầu dòng và ký hiệu mã số (NLS, TC, CV...).
4. KHÔNG IN ĐẬM: Nội dung NLS phải là chữ thường (normal weight), không được in đậm.
5. Vị trí: Chèn ngay dưới mục tiêu hoạt động hoặc phần năng lực phù hợp nhất.
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

            let b = (newRPr as Element).getElementsByTagName("w:b")[0];
            if (!b) {
              b = xmlDoc.createElementNS(WORD_NS, "w:b");
              newRPr.appendChild(b);
            }
            b.setAttributeNS(WORD_NS, "w:val", "0");

            let bCs = (newRPr as Element).getElementsByTagName("w:bCs")[0];
            if (!bCs) {
              bCs = xmlDoc.createElementNS(WORD_NS, "w:bCs");
              newRPr.appendChild(bCs);
            }
            bCs.setAttributeNS(WORD_NS, "w:val", "0");

            r.appendChild(newRPr);
            const t = xmlDoc.createElementNS(WORD_NS, "w:t");
            t.setAttribute("xml:space", "preserve");
            // THỤT VÀO 1 TAB BẰNG CÁCH THÊM \t
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
    reader.onerror = () => reject(new Error("Lỗi khi xử lý file Word."));
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const processLessonPlan = async () => {
    if (!file) return;
    
    // Kiểm tra API Key từ môi trường Vercel
    const apiKey = process.env.API_KEY;
    if (!apiKey || apiKey === "undefined") {
      setError("Thiếu API_KEY. Vui lòng cấu hình Environment Variable trên Vercel.");
      setStep(2);
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStep(3);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const docText = await extractTextFromDocx(file);

      const prompt = `
        BẠN LÀ CHUYÊN GIA GIÁO DỤC SỐ. 
        NHIỆM VỤ: ${NLS_MAPPING_RULES}
        Mức độ tích hợp yêu cầu: ${level}.
        NỘI DUNG GIÁO ÁN CẦN PHÂN TÍCH:
        ---
        ${docText.substring(0, 15000)}
        ---
        Trả về JSON đúng cấu trúc.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
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
                    nlsContent: { type: Type.STRING },
                    location: { type: Type.STRING }
                  },
                  required: ["searchText", "nlsContent"]
                }
              }
            }
          }
        }
      });

      const data = JSON.parse(response.text || '{}');
      if (!data.additions || data.additions.length === 0) throw new Error("AI không tìm thấy vị trí phù hợp.");
      
      const patchedDocx = await patchDocxWithNLS(file, data.additions);
      setResult(patchedDocx);
    } catch (err: any) {
      setError(err.message || "Xử lý thất bại. Vui lòng kiểm tra lại API Key hoặc kết nối mạng.");
      setStep(2);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadResults = () => {
    if (result && file) saveAs(result, `NLS_TichHop_${file.name}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="gradient-bg text-white py-14 shadow-2xl px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -mr-40 -mt-40 blur-3xl"></div>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
          <div className="flex items-center gap-6">
            <div className="bg-white/15 p-5 rounded-[2rem] backdrop-blur-2xl border border-white/25 shadow-2xl">
              <Sparkles size={42} className="text-yellow-300 animate-bounce" />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white leading-tight">
                GIÁO ÁN TÍCH HỢP <span className="text-yellow-300">NLS</span>
              </h1>
              <p className="text-blue-100 font-bold mt-2 flex items-center gap-2 text-lg">
                Trợ lý AI bổ sung Năng lực số cho mọi môn học
              </p>
            </div>
          </div>
          <div className="bg-white/10 px-8 py-4 rounded-3xl border border-white/20 flex flex-col items-end gap-1 backdrop-blur-xl">
            <span className="text-xs font-black uppercase tracking-widest text-blue-200">Phát triển bởi</span>
            <div className="flex items-center gap-3">
              <ShieldCheck size={20} className="text-green-300" />
              <span className="text-lg font-black tracking-tight">Đinh Thành: 0915.213717</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full px-6 py-16 flex-grow">
        <div className="flex items-center justify-center mb-16 max-w-lg mx-auto relative">
          <div className="absolute top-1/2 left-0 w-full h-1.5 bg-slate-200 -z-10 -translate-y-1/2 rounded-full"></div>
          <div className="absolute top-1/2 left-0 h-1.5 bg-blue-500 -z-10 -translate-y-1/2 rounded-full transition-all duration-700" style={{ width: `${(step - 1) * 50}%` }}></div>
          {[1, 2, 3].map((s) => (
            <div key={s} className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl transition-all ${step >= s ? 'bg-blue-600 text-white shadow-xl' : 'bg-white text-slate-400 border-2 border-slate-200'}`}>
              {s}
            </div>
          ))}
        </div>

        <div className="grid gap-10">
          {step === 1 && (
            <div onClick={() => fileInputRef.current?.click()} className="bg-white rounded-[3rem] p-16 md:p-24 border-4 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all cursor-pointer flex flex-col items-center group shadow-2xl shadow-blue-900/5 relative">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".docx" />
              <div className="bg-blue-600 p-12 rounded-full mb-10 group-hover:scale-110 transition-all shadow-2xl">
                <FileUp size={64} className="text-white" />
              </div>
              <h3 className="text-4xl font-black text-slate-800 mb-6 text-center">Tải giáo án lên (.docx)</h3>
              <p className="text-slate-500 text-center max-w-md font-semibold text-xl leading-relaxed">
                Hỗ trợ mọi môn học. Tự động chèn NLS chuẩn CV 3456.
              </p>
              {error && <div className="mt-8 text-red-600 font-bold bg-red-50 px-8 py-5 rounded-3xl border border-red-100 flex items-center gap-3"><AlertCircle size={24} /> {error}</div>}
            </div>
          )}

          {step === 2 && (
            <div className="bg-white rounded-[3rem] p-12 shadow-2xl border border-slate-100">
              <div className="flex items-center gap-5 mb-12 pb-8 border-b border-slate-100">
                <div className="p-4 bg-blue-50 rounded-2xl text-blue-600"><Settings size={36} /></div>
                <h3 className="text-3xl font-black italic">Cấu hình AI thông minh</h3>
              </div>
              <div className="mb-14">
                <label className="flex items-center gap-4 font-black text-slate-800 text-xl uppercase tracking-wider mb-8"><Layers size={26} className="text-blue-500" /> Mức độ tích hợp</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {['Cơ bản', 'Chuẩn', 'Mở rộng'].map(l => (
                    <button key={l} onClick={() => setLevel(l)} className={`py-8 px-6 rounded-[2rem] font-black text-xl transition-all border-2 ${level === l ? 'bg-blue-600 text-white border-blue-600 shadow-xl' : 'bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100'}`}>{l}</button>
                  ))}
                </div>
              </div>
              {error && <div className="mb-8 text-red-600 font-bold bg-red-50 px-8 py-5 rounded-3xl border border-red-100 flex items-center gap-3"><AlertCircle size={24} /> {error}</div>}
              <div className="flex flex-col md:flex-row items-center gap-8 justify-between pt-12 border-t border-slate-100">
                <div className="flex items-center gap-5 p-6 bg-slate-50 rounded-3xl border border-slate-200 w-full md:w-auto">
                   <FileText className="text-blue-500" />
                   <span className="font-bold text-slate-700 truncate max-w-[200px]">{file?.name}</span>
                   <button onClick={() => setStep(1)} className="text-blue-600 font-black hover:underline text-sm ml-4">ĐỔI</button>
                </div>
                <button onClick={processLessonPlan} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-16 py-8 rounded-[2rem] font-black text-2xl flex items-center justify-center gap-5 shadow-2xl transition-transform active:scale-95">XỬ LÝ NGAY <ChevronRight size={32} /></button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="bg-white rounded-[3.5rem] p-16 shadow-2xl border border-slate-100 flex flex-col items-center text-center">
              {!result ? (
                <>
                  <div className="relative mb-16">
                    <div className="relative bg-blue-50 p-16 rounded-full border-8 border-white shadow-2xl"><Loader2 size={100} className="text-blue-600 animate-spin" /></div>
                  </div>
                  <h3 className="text-4xl font-black text-slate-900 mb-8 italic animate-pulse">AI đang phân tích ngữ cảnh...</h3>
                  <div className="space-y-5 max-w-md w-full">
                    <div className="flex items-center gap-5 p-5 bg-blue-50 rounded-3xl text-blue-700 font-bold"><Globe size={28} /> Nhận diện môn học & ngôn ngữ</div>
                    <div className="flex items-center gap-5 p-5 bg-green-50 rounded-3xl text-green-700 font-bold"><ShieldCheck size={28} /> Kiểm định CV 3456/BGDĐT</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-green-100 p-14 rounded-full mb-12 shadow-inner border-8 border-white"><CheckCircle2 size={100} className="text-green-600" /></div>
                  <h3 className="text-5xl font-black text-slate-900 mb-8 uppercase">Hoàn tất!</h3>
                  <p className="text-slate-600 mb-14 max-w-xl mx-auto font-bold text-2xl italic">Năng lực số đã được tích hợp chuẩn xác và thụt lề thẳng hàng.</p>
                  <div className="flex flex-col md:flex-row gap-8 w-full justify-center">
                    <button onClick={downloadResults} className="bg-blue-600 hover:bg-blue-700 text-white px-16 py-8 rounded-[2rem] font-black text-2xl flex items-center justify-center gap-5 shadow-2xl active:scale-95 transition-transform"><Download size={32} /> TẢI FILE KẾT QUẢ</button>
                    <button onClick={() => { setFile(null); setResult(null); setStep(1); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-12 py-8 rounded-[2rem] font-black text-xl flex items-center justify-center gap-4 active:scale-95 transition-transform">XỬ LÝ FILE KHÁC</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="py-20 bg-white border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-6 text-center text-slate-400 font-bold uppercase tracking-widest">
          © 2024 AI Education Assistant - GIÁO ÁN TÍCH HỢP NLS
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
