
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
  Layers, 
  Globe,
  Sparkles,
  Key,
  BookOpen,
  MessageSquare,
  Trash2,
  Lightbulb,
  Plus,
  Check
} from 'lucide-react';

const saveAs = (FileSaverModule as any).saveAs || (FileSaverModule as any).default || FileSaverModule;

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const NLS_MAPPING_RULES = `
BẠN LÀ TRỢ LÝ AI CHUYÊN BỔ SUNG NĂNG LỰC SỐ (NLS) CHO GIÁO ÁN THEO CHUẨN CV 3456/BGDĐT.

QUY TẮC NGÔN NGỮ:
- Nếu giáo án có Tiếng Anh (Unit, Lesson, Objectives...), viết NLS bằng TIẾNG ANH.
- Nếu giáo án Tiếng Việt, viết NLS bằng Tiếng Việt.

QUY TẮC ĐỊNH DẠNG:
1. Mã NLS/TC theo CV 3456/BGDĐT (Ví dụ: NLS1, TC1a).
2. Không in đậm, không ký hiệu đầu dòng, viết hoa chữ cái đầu.
3. Chèn ngay dưới mục tiêu hoạt động hoặc năng lực thành phần.
`;

interface NLSAddition {
  searchText: string;
  nlsContent: string;
}

interface Appendix {
  id: string;
  name: string;
  text: string;
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
    reader.onerror = () => reject(new Error("Lỗi khi đọc file."));
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
  const [step, setStep] = useState(0); 
  const [appendices, setAppendices] = useState<Appendix[]>([]);
  const [customRequest, setCustomRequest] = useState<string>("");
  const [includeActivities, setIncludeActivities] = useState<boolean>(true);
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState('Chuẩn');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const [customKey, setCustomKey] = useState(sessionStorage.getItem('GEMINI_KEY') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendixInputRef = useRef<HTMLInputElement>(null);

  const getActiveApiKey = () => customKey || process.env.API_KEY || (window as any).process?.env?.API_KEY;

  const handleAppendixUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      const newAppendices: Appendix[] = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i];
        if (f.name.endsWith('.docx')) {
          try {
            const text = await extractTextFromDocx(f);
            newAppendices.push({
              id: Math.random().toString(36).substr(2, 9),
              name: f.name,
              text: text
            });
          } catch (err) {
            setError(`Không thể đọc file: ${f.name}`);
          }
        }
      }
      setAppendices(prev => [...prev, ...newAppendices]);
      if (e.target) e.target.value = ""; 
    }
  };

  const removeAppendix = (id: string) => {
    setAppendices(prev => prev.filter(a => a.id !== id));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.name.endsWith('.docx')) {
      setFile(selected);
      setError(null);
      setStep(2);
    }
  };

  const processLessonPlan = async () => {
    const apiKey = getActiveApiKey();
    if (!apiKey) { setShowKeyInput(true); return; }

    setIsProcessing(true);
    setError(null);
    setStep(3);

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const docText = await extractTextFromDocx(file!);

      const combinedAppendixText = appendices.map(a => `--- PHỤ LỤC: ${a.name} ---\n${a.text}`).join("\n\n");

      const finalPrompt = `
        NHIỆM VỤ: ${NLS_MAPPING_RULES}
        ${appendices.length > 0 ? `BỐI CẢNH TỔNG HỢP TỪ ${appendices.length} PHỤ LỤC MÔN HỌC:\n${combinedAppendixText.substring(0, 8000)}\n` : ""}
        TÙY CHỌN TÍCH HỢP: ${includeActivities ? "HÃY TÍCH HỢP NLS VÀO CẢ CÁC MỤC TIÊU HOẠT ĐỘNG (BƯỚC 1, 2, 3...)" : "CHỈ TÍCH HỢP NLS VÀO PHẦN NĂNG LỰC CHUNG/THÀNH PHẦN, KHÔNG CHÈN VÀO CÁC BƯỚC HOẠT ĐỘNG."}
        YÊU CẦU TÙY CHỈNH CỦA GIÁO VIÊN: ${customRequest || "Không có yêu cầu riêng."}
        MỨC ĐỘ TÍCH HỢP: ${level}
        NỘI DUNG GIÁO ÁN CẦN XỬ LÝ:
        ${docText.substring(0, 15000)}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: finalPrompt,
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
      const patchedDocx = await patchDocxWithNLS(file!, data.additions || []);
      setResult(patchedDocx);
    } catch (err: any) {
      setError(err.message || "Lỗi xử lý AI.");
      setStep(2);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadResults = () => {
    if (result && file) saveAs(result, file.name.replace('.docx', '_TichHopNLS.docx'));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fcfdfe] text-slate-900">
      <header className="gradient-bg text-white py-10 shadow-2xl px-6 relative">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="bg-white/10 p-4 rounded-3xl backdrop-blur-xl border border-white/20 shadow-inner">
              <Sparkles size={32} className="text-yellow-300" />
            </div>
            <div>
              <h1 className="text-2xl md:text-4xl font-black uppercase tracking-tight">TÍCH HỢP <span className="text-yellow-300 text-shadow-sm">NLS</span> CHUYÊN SÂU</h1>
              <p className="text-blue-100 font-bold opacity-90 text-sm md:text-base">Trợ lý AI Đinh Thành - Chuẩn hóa CV 3456</p>
            </div>
          </div>
          {appendices.length > 0 && (
            <div className="flex items-center gap-3 bg-white/10 px-4 py-2 rounded-2xl border border-white/10">
              <BookOpen size={18} className="text-yellow-200" />
              <span className="text-xs font-bold">Đã nạp {appendices.length} phụ lục</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full px-6 py-12 flex-grow">
        {showKeyInput && (
          <div className="mb-10 bg-amber-50 border-2 border-amber-200 p-8 rounded-[2.5rem] shadow-xl animate-in slide-in-from-top-4">
            <div className="flex items-center gap-3 mb-4 text-amber-800 font-black text-xl"><Key /> NHẬP API KEY</div>
            <div className="flex gap-4">
              <input type="password" value={customKey} onChange={(e) => setCustomKey(e.target.value)} placeholder="Dán API Key..." className="flex-grow bg-white border-2 border-amber-200 px-6 py-4 rounded-2xl shadow-inner focus:outline-none focus:ring-4 ring-amber-100 transition-all" />
              <button onClick={() => { sessionStorage.setItem('GEMINI_KEY', customKey); setShowKeyInput(false); }} className="bg-amber-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-amber-700 transition-all">LƯU</button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-16 px-4">
          {['Phụ lục', 'Giáo án', 'Cấu hình', 'Kết quả'].map((label, i) => (
            <div key={i} className="flex flex-col items-center gap-3 relative flex-1">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black transition-all z-10 ${step >= i ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-300'}`}>{i + 1}</div>
              <span className={`text-[10px] uppercase font-black tracking-widest ${step >= i ? 'text-blue-600' : 'text-slate-300'}`}>{label}</span>
              {i < 3 && <div className={`absolute top-5 left-[60%] w-[80%] h-0.5 -z-0 ${step > i ? 'bg-blue-600' : 'bg-slate-100'}`}></div>}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-white rounded-[3rem] p-10 border-4 border-dashed border-blue-100 shadow-xl">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="bg-blue-100 p-6 rounded-full mb-4 text-blue-600 shadow-inner"><BookOpen size={32} /></div>
                <h3 className="text-2xl font-black text-slate-800">Kho Phụ lục Môn học</h3>
                <p className="text-slate-500 text-sm font-medium">Bạn có thể tải lên một hoặc nhiều tệp phụ lục để AI có bối cảnh tốt nhất.</p>
              </div>

              {appendices.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                  {appendices.map(app => (
                    <div key={app.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText size={18} className="text-blue-500 flex-shrink-0" />
                        <span className="text-sm font-bold truncate text-slate-700">{app.name}</span>
                      </div>
                      <button onClick={() => removeAppendix(app.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-4">
                <button onClick={() => appendixInputRef.current?.click()} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 py-5 rounded-2xl font-black flex items-center justify-center gap-2 border-2 border-blue-200 transition-all active:scale-95">
                  <Plus size={20} /> THÊM PHỤ LỤC (.DOCX)
                </button>
                <input type="file" ref={appendixInputRef} onChange={handleAppendixUpload} className="hidden" accept=".docx" multiple />
                
                <button onClick={() => setStep(1)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-blue-200 transition-all active:scale-95">
                  TIẾP THEO <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div onClick={() => fileInputRef.current?.click()} className="bg-white rounded-[3.5rem] p-20 border-4 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer flex flex-col items-center group shadow-2xl animate-in slide-in-from-right-8 duration-500">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".docx" />
            <div className="bg-blue-600 p-12 rounded-full mb-8 group-hover:scale-110 transition-all shadow-2xl shadow-blue-200"><FileUp size={56} className="text-white" /></div>
            <h3 className="text-4xl font-black text-slate-800 mb-4 tracking-tight">Tải giáo án cần xử lý</h3>
            <p className="text-slate-500 font-bold text-lg italic">
              {appendices.length > 0 ? `AI sẽ sử dụng ${appendices.length} phụ lục đã tải làm bối cảnh.` : "Sử dụng kiến thức mặc định của AI về CV 3456."}
            </p>
            <button onClick={(e) => { e.stopPropagation(); setStep(0); }} className="mt-8 text-blue-600 font-black text-sm uppercase hover:underline">Quay lại quản lý phụ lục</button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl border border-slate-100 animate-in fade-in duration-500">
            <div className="space-y-10">
              <div className="relative">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <label className="flex items-center gap-3 font-black text-slate-800 text-lg uppercase tracking-wider"><MessageSquare size={22} className="text-blue-500" /> Yêu cầu văn bản cho AI</label>
                  
                  {/* Tùy chọn tích hợp vào ô hoạt động */}
                  <div 
                    onClick={() => setIncludeActivities(!includeActivities)}
                    className="flex items-center gap-3 cursor-pointer group"
                  >
                    <div className={`w-12 h-6 rounded-full transition-all flex items-center p-1 ${includeActivities ? 'bg-blue-600' : 'bg-slate-200'}`}>
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-all ${includeActivities ? 'translate-x-6' : 'translate-x-0'}`}></div>
                    </div>
                    <span className={`text-xs font-black uppercase tracking-tight transition-colors ${includeActivities ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                      Tích hợp vào ô hoạt động
                    </span>
                  </div>
                </div>

                <div className="relative group">
                  <textarea 
                    value={customRequest} 
                    onChange={(e) => setCustomRequest(e.target.value)}
                    placeholder="Nhập yêu cầu tại đây... (Ví dụ: Tập trung vào năng lực khai thác học liệu số, dùng ngôn ngữ chuyên ngành môn Lịch sử, viết mã NLS in đậm...)"
                    className="w-full bg-slate-50 border-2 border-slate-100 p-8 rounded-[2.5rem] h-48 focus:outline-none focus:ring-4 ring-blue-50 font-bold text-slate-700 transition-all resize-none shadow-inner group-hover:border-blue-100"
                  />
                  <div className="absolute top-4 right-4">
                    <Lightbulb size={18} className="text-blue-200" />
                  </div>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-3 font-black text-slate-800 text-lg uppercase tracking-wider mb-6"><Layers size={22} className="text-blue-500" /> Mức độ tích hợp</label>
                <div className="grid grid-cols-3 gap-4">
                  {['Cơ bản', 'Chuẩn', 'Mở rộng'].map(l => (
                    <button key={l} onClick={() => setLevel(l)} className={`py-5 rounded-2xl font-black transition-all ${level === l ? 'bg-blue-600 text-white shadow-xl scale-105' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 border-2 border-transparent hover:border-slate-200'}`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-6 justify-between pt-10 mt-10 border-t border-slate-50">
              <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 w-full md:w-auto">
                 <FileText className="text-blue-500" />
                 <span className="font-bold truncate max-w-[200px] text-sm">{file?.name}</span>
                 <button onClick={() => setStep(1)} className="text-blue-600 font-black text-[10px] hover:underline ml-2 uppercase">Thay đổi</button>
              </div>
              <button onClick={processLessonPlan} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-14 py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-4 shadow-2xl active:scale-95 transition-all">TIẾN HÀNH TÍCH HỢP <ChevronRight /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white rounded-[4rem] p-16 shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-in zoom-in-95">
            {!result ? (
              <>
                <div className="relative mb-12">
                  <div className="bg-blue-50 p-16 rounded-full border-4 border-white shadow-xl relative z-10"><Loader2 size={80} className="text-blue-600 animate-spin" /></div>
                  <div className="absolute inset-0 bg-blue-400/20 rounded-full blur-3xl animate-pulse"></div>
                </div>
                <h3 className="text-4xl font-black text-slate-900 mb-6 italic animate-pulse">AI Đang thực thi bối cảnh...</h3>
                <p className="text-slate-400 font-bold mb-8 italic max-w-md">
                  Đang tổng hợp: {appendices.length} Phụ lục + {includeActivities ? "Hoạt động" : "Cấu trúc"} + Yêu cầu riêng
                </p>
                <div className="w-full max-w-sm bg-slate-100 h-2 rounded-full overflow-hidden mb-4"><div className="h-full bg-blue-600 w-2/3 animate-[shimmer_2s_infinite]"></div></div>
              </>
            ) : (
              <>
                <div className="bg-green-100 p-12 rounded-full mb-10 shadow-inner border-4 border-white relative"><CheckCircle2 size={80} className="text-green-600" /><div className="absolute -top-2 -right-2 bg-yellow-400 text-white p-3 rounded-full shadow-lg animate-bounce"><Sparkles size={20}/></div></div>
                <h3 className="text-5xl font-black text-slate-900 mb-4 uppercase tracking-tighter">HOÀN TẤT</h3>
                <p className="text-slate-500 mb-12 font-bold text-xl italic">Giáo án của bạn đã sẵn sàng với NLS tích hợp theo bối cảnh đa phụ lục.</p>
                <div className="flex flex-col md:flex-row gap-6 w-full justify-center">
                  <button onClick={downloadResults} className="bg-blue-600 hover:bg-blue-700 text-white px-14 py-7 rounded-3xl font-black text-2xl flex items-center justify-center gap-4 shadow-2xl active:scale-95 transition-all"><Download size={32} /> TẢI XUỐNG .DOCX</button>
                  <button onClick={() => { setFile(null); setResult(null); setStep(1); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-10 py-7 rounded-3xl font-black text-lg transition-all">LÀM GIÁO ÁN TIẾP THEO</button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="py-12 bg-white border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6 text-center">
           <div className="text-slate-300 font-black uppercase tracking-widest text-[10px] mb-4">
            Digital Competence Integrated System - AI Assistant for Teachers
          </div>
          <p className="text-slate-400 text-[10px] font-bold">© 2025 Đinh Thành AI - Giải pháp số hóa giáo dục</p>
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
