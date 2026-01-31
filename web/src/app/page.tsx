"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RecordItem = {
  id: string;
  createdAt: number;
  content: string;
  mood: string;
  images?: string[];
  videos?: string[];
};

type MediaItem = {
  id: string;
  localUrl: string;
  remoteUrl: string;
  uploading: boolean;
};

export default function Home() {
  const [text, setText] = useState("");
  const [images, setImages] = useState<MediaItem[]>([]);
  const [videos, setVideos] = useState<MediaItem[]>([]);
  const [moodLabel, setMoodLabel] = useState("");
  const [moodInput, setMoodInput] = useState("");
  const moodDefaults = ["平静", "有点乱", "很轻", "疲惫", "清醒"];
  const [moodHistory, setMoodHistory] = useState<string[]>([]);
  const [showMoodPicker, setShowMoodPicker] = useState(false);
  const [hint, setHint] = useState("");
  const [armedMediaId, setArmedMediaId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<{
    url: string;
    type: "image" | "video";
  } | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [searchResults, setSearchResults] = useState<RecordItem[]>([]);
  const [recallIndex, setRecallIndex] = useState(0);
  const [autoRecall, setAutoRecall] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchStart, setSearchStart] = useState("");
  const [searchEnd, setSearchEnd] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [timeRangeLabel, setTimeRangeLabel] = useState("");
  const [timeStats, setTimeStats] = useState({
    last7: 0,
    last30: 0,
    last90: 0,
  });

  const imagePreviews = useMemo(() => images, [images]);
  const videoPreviews = useMemo(() => videos, [videos]);
  const moodOptions = useMemo(() => moodHistory.slice(0, 5), [moodHistory]);

  const updateMoodHistory = (next: string[]) => {
    setMoodHistory(next);
    try {
      window.localStorage.setItem("moodHistory", JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const hasUploading = useMemo(
    () => images.some((item) => item.uploading) || videos.some((item) => item.uploading),
    [images, videos]
  );
  const canSave = useMemo(() => {
    const hasMedia = images.length > 0 || videos.length > 0;
    const hasText = text.trim().length > 0;
    const hasMood = moodLabel.trim().length > 0;
    return (hasText || hasMedia || hasMood) && !hasUploading;
  }, [hasUploading, images.length, moodLabel, text, videos.length]);

  const showHint = (message: string, duration = 1500) => {
    setHint(message);
    if (duration > 0) {
      window.setTimeout(() => setHint(""), duration);
    }
  };

  const uploadFile = async (file: File, resourceType: "image" | "video") => {
    const form = new FormData();
    form.append("file", file);
    form.append("resourceType", resourceType);
    const response = await fetch("/api/upload", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      throw new Error("Upload failed");
    }
    const data = await response.json();
    return data.url as string;
  };

  const handleImagesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length > 0) {
      files.forEach(async (file) => {
        const localUrl = URL.createObjectURL(file);
        const id = `img-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setImages((prev) => [
          ...prev,
          { id, localUrl, remoteUrl: "", uploading: true },
        ]);
        try {
          const url = await uploadFile(file, "image");
          setImages((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, remoteUrl: url, uploading: false } : item
            )
          );
          showHint("图片已经放进来。");
        } catch {
          setImages((prev) => prev.filter((item) => item.id !== id));
          URL.revokeObjectURL(localUrl);
          showHint("图片上传失败了。");
        }
      });
    }
  };

  const handleVideosChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length > 0) {
      files.forEach(async (file) => {
        const localUrl = URL.createObjectURL(file);
        const id = `vid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        setVideos((prev) => [
          ...prev,
          { id, localUrl, remoteUrl: "", uploading: true },
        ]);
        try {
          const url = await uploadFile(file, "video");
          setVideos((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, remoteUrl: url, uploading: false } : item
            )
          );
          showHint("视频已经放进来。");
        } catch {
          setVideos((prev) => prev.filter((item) => item.id !== id));
          URL.revokeObjectURL(localUrl);
          showHint("视频上传失败了。");
        }
      });
    }
  };

  const handleMoodClick = () => {
    setShowMoodPicker((prev) => !prev);
  };

  const setMood = (value: string) => {
    setMoodLabel(value);
    setMoodInput("");
    setShowMoodPicker(false);
  };

  const handleSave = async () => {
    if (!canSave) {
      showHint("先留下一点点，再继续也可以。");
      return;
    }
    try {
      const normalizedContent = formatContent(text.trim());
      const payload = {
        content: normalizedContent === "（未写文字）" ? "" : normalizedContent,
        mood: moodLabel,
        images: imagePreviews
          .map((item) => item.remoteUrl)
          .filter((url) => url),
        videos: videoPreviews
          .map((item) => item.remoteUrl)
          .filter((url) => url),
      };
      const response = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Failed to save");
      }
      const record = await response.json();
      const mapped: RecordItem = {
        id: record.id,
        createdAt: new Date(record.createdAt).getTime(),
        content: formatContent(record.content || ""),
        mood: record.mood || "",
        images: record.images || [],
        videos: record.videos || [],
      };
      setRecords((prev) => [mapped, ...prev]);
      setSearchResults((prev) =>
        searchActive ? [mapped, ...prev] : prev
      );
      loadStats();
      setText("");
      images.forEach((item) => URL.revokeObjectURL(item.localUrl));
      videos.forEach((item) => URL.revokeObjectURL(item.localUrl));
      setImages([]);
      setVideos([]);
      setMoodLabel("");
      setShowMoodPicker(false);
      setMoodInput("");
      if (moodLabel) {
        updateMoodHistory(
          [moodLabel, ...moodHistory.filter((item) => item !== moodLabel)].slice(0, 5)
        );
      }
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
      showHint("这条已经留住了。", 2000);
    } catch {
      showHint("这条暂时没留住，我们等一下再试。");
    }
  };

  const handleCopy = async (content: string) => {
    const normalized = formatContent(content);
    if (!normalized.trim() || normalized === "（未写文字）") {
      showHint("这一条还没有文字。");
      return;
    }
    try {
      await navigator.clipboard.writeText(normalized);
      showHint("已复制到剪贴板。");
    } catch {
      showHint("这次没有复制成功。");
    }
  };

  const handleDownload = (record: RecordItem) => {
    const items = [...(record.images ?? []), ...(record.videos ?? [])];
    if (items.length === 0) {
      showHint("这一条里还没有可下载的内容。");
      return;
    }
    const downloadOne = async (url: string, filename: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Download failed");
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      } catch {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    };
    items.forEach((url, index) => {
      downloadOne(url, `record-${record.id}-${index + 1}`);
    });
    showHint("已经开始下载。");
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/records?id=${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed");
      setRecords((prev) => prev.filter((item) => item.id !== id));
      setSearchResults((prev) => prev.filter((item) => item.id !== id));
      loadStats();
      showHint("已删除这一条。");
    } catch {
      showHint("这条暂时删不掉，我们等一下再试。");
    }
  };

  const applyTimeRange = (days: number, label: string) => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    const toDateString = (date: Date) =>
      date.toISOString().slice(0, 10);
    setSearchStart(toDateString(start));
    setSearchEnd(toDateString(end));
    setSearchKeyword("");
    setSearchActive(true);
    setTimeRangeLabel(label);
    performSearch();
  };

  useEffect(() => {
    if (!autoRecall || records.length === 0) return;
    const timer = window.setInterval(() => {
      setRecallIndex((prev) => (prev + 1) % records.length);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [autoRecall, records.length]);

  const recallItem = records[recallIndex % (records.length || 1)];

  const hasSearchCriteria =
    searchKeyword.trim().length > 0 || searchStart.length > 0 || searchEnd.length > 0;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} ${hh}:${min} · 当下`;
  };

  const loadRecords = async () => {
    try {
      const response = await fetch("/api/records");
      if (!response.ok) throw new Error("Failed to load");
      const data = await response.json();
      const mapped = data.map((item: any) => ({
        id: item.id,
        createdAt: new Date(item.createdAt).getTime(),
        content: formatContent(item.content || ""),
        mood: item.mood || "",
        images: item.images || [],
        videos: item.videos || [],
      }));
      setRecords(mapped);
    } catch {
      showHint("暂时无法读取记录。");
    }
  };

  const performSearch = async () => {
    try {
      const params = new URLSearchParams();
      if (searchKeyword.trim()) params.set("keyword", searchKeyword.trim());
      if (searchStart) params.set("start", searchStart);
      if (searchEnd) params.set("end", searchEnd);
      const response = await fetch(`/api/records?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to search");
      const data = await response.json();
      const mapped = data.map((item: any) => ({
        id: item.id,
        createdAt: new Date(item.createdAt).getTime(),
        content: formatContent(item.content || ""),
        mood: item.mood || "",
        images: item.images || [],
        videos: item.videos || [],
      }));
      setSearchResults(mapped);
    } catch {
      showHint("这次没有找到对应的时刻。");
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch("/api/records?mode=stats");
      if (!response.ok) throw new Error("Failed");
      const data = await response.json();
      setTimeStats({
        last7: data.last7 ?? 0,
        last30: data.last30 ?? 0,
        last90: data.last90 ?? 0,
      });
    } catch {
      // ignore stats errors
    }
  };

  const formatContent = (value: string) => {
    const cleaned = value.replace(/\n\s*0\s*$/, "").trimEnd();
    return cleaned || "（未写文字）";
  };

  useEffect(() => {
    loadRecords();
    loadStats();
    try {
      const raw = window.localStorage.getItem("moodHistory");
      if (raw) {
        const stored = JSON.parse(raw);
        if (Array.isArray(stored)) {
          setMoodHistory(stored);
          return;
        }
      }
    } catch {
      // ignore storage errors
    }
    setMoodHistory(moodDefaults);
  }, []);

  const displayRecords = searchActive ? searchResults : records;

  return (
    <div className="page">
      <header>
        <div className="brand">
          <div className="logo">不失</div>
          <div className="title">
            <h1>私密记录空间 · MVP</h1>
            <p>先接住当下，再在未来轻轻回放。</p>
          </div>
        </div>
      </header>

      <main className={`layout ${searchActive ? "layout--searching" : ""}`}>
        <section className="panel capture">
          <div className="capture-top">
            <div>
              <h2>立即放下一个“当下切片”</h2>
              <p>不需要标题、不需要结构。你只需要把此刻真实放进去。</p>
            </div>
            <div className="input-block">
              <div className="textarea-wrap">
                <textarea
                  placeholder=" "
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <div className="ghost-hint">
                  <div>此刻的你正在想什么？不用整理，不用体面。</div>
                  <div>哪怕只是一句话，也够了。</div>
                </div>
                {(imagePreviews.length > 0 || videoPreviews.length > 0) && (
                  <div className="media-preview">
                    {imagePreviews.map((item, index) => {
                    const id = item.id;
                      const armed = armedMediaId === id;
                      return (
                        <button
                        key={item.id}
                          className={`media-card ${armed ? "media-card--armed" : ""}`}
                          type="button"
                          onClick={() => {
                            if (armed) {
                            setPreviewItem({
                              url: item.remoteUrl || item.localUrl,
                              type: "image",
                            });
                            } else {
                              setArmedMediaId(id);
                            }
                          }}
                        >
                        <img src={item.localUrl} alt={`图片预览 ${index + 1}`} />
                          {armed ? (
                            <span className="media-remove">
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setImages((prev) => {
                                  const next = prev.filter((file) => file.id !== item.id);
                                    if (next.length === 0 && imageInputRef.current) {
                                      imageInputRef.current.value = "";
                                    }
                                    return next;
                                  });
                                URL.revokeObjectURL(item.localUrl);
                                  setArmedMediaId(null);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.stopPropagation();
                                    setImages((prev) => {
                                    const next = prev.filter((file) => file.id !== item.id);
                                      if (next.length === 0 && imageInputRef.current) {
                                        imageInputRef.current.value = "";
                                      }
                                      return next;
                                    });
                                  URL.revokeObjectURL(item.localUrl);
                                    setArmedMediaId(null);
                                  }
                                }}
                              >
                                ×
                              </span>
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    {videoPreviews.map((item, index) => {
                    const id = item.id;
                      const armed = armedMediaId === id;
                      return (
                        <button
                        key={item.id}
                          className={`media-card ${armed ? "media-card--armed" : ""}`}
                          type="button"
                          onClick={() => {
                            if (armed) {
                            setPreviewItem({
                              url: item.remoteUrl || item.localUrl,
                              type: "video",
                            });
                            } else {
                              setArmedMediaId(id);
                            }
                          }}
                        >
                        <video src={item.localUrl} />
                          {armed ? (
                            <span className="media-remove">
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setVideos((prev) => {
                                  const next = prev.filter((file) => file.id !== item.id);
                                    if (next.length === 0 && videoInputRef.current) {
                                      videoInputRef.current.value = "";
                                    }
                                    return next;
                                  });
                                URL.revokeObjectURL(item.localUrl);
                                  setArmedMediaId(null);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.stopPropagation();
                                    setVideos((prev) => {
                                    const next = prev.filter((file) => file.id !== item.id);
                                      if (next.length === 0 && videoInputRef.current) {
                                        videoInputRef.current.value = "";
                                      }
                                      return next;
                                    });
                                  URL.revokeObjectURL(item.localUrl);
                                    setArmedMediaId(null);
                                  }
                                }}
                              >
                                ×
                              </span>
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="capture-actions">
                <button
                  className={`chip ${text.trim() ? "chip-active" : ""}`}
                  type="button"
                >
                  文字
                </button>
                <button
                  className={`chip ${images.length ? "chip-active" : ""}`}
                  type="button"
                  onClick={() => {
                    if (imageInputRef.current) imageInputRef.current.value = "";
                    imageInputRef.current?.click();
                  }}
                >
                  图片{images.length ? ` · ${images.length}` : ""}
                </button>
                <button
                  className={`chip ${videos.length ? "chip-active" : ""}`}
                  type="button"
                  onClick={() => {
                    if (videoInputRef.current) videoInputRef.current.value = "";
                    videoInputRef.current?.click();
                  }}
                >
                  视频{videos.length ? ` · ${videos.length}` : ""}
                </button>
                <button
                  className={`chip ${moodLabel ? "chip-active" : ""}`}
                  type="button"
                  onClick={handleMoodClick}
                >
                  情绪：{moodLabel || "未设"}
                  {moodLabel ? (
                    <span
                      className="mood-clear"
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMoodLabel("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.stopPropagation();
                          setMoodLabel("");
                        }
                      }}
                    >
                      ×
                    </span>
                  ) : null}
                </button>
                <button
                  className="primary-btn"
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  保存这一刻
                </button>
              </div>
              {showMoodPicker ? (
                <div className="mood-picker">
                  {moodOptions.map((option) => (
                    <button
                      key={option}
                      className={`chip ${moodLabel === option ? "chip-active" : ""}`}
                      type="button"
                      onClick={() => setMood(option)}
                    >
                      {option}
                    </button>
                  ))}
                  <div className="mood-input">
                    <input
                      type="text"
                      placeholder="自定义情绪"
                      value={moodInput}
                      onChange={(event) => setMoodInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && moodInput.trim()) {
                          setMood(moodInput.trim());
                        }
                      }}
                    />
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => {
                        if (moodInput.trim()) setMood(moodInput.trim());
                      }}
                    >
                      设定
                    </button>
                  </div>
                  <button
                    className="text-btn"
                    type="button"
                    onClick={() => {
                      setMoodLabel("");
                      setShowMoodPicker(false);
                      updateMoodHistory([]);
                    }}
                  >
                    清空情绪
                  </button>
                </div>
              ) : null}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImagesChange}
                hidden
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                multiple
                onChange={handleVideosChange}
                hidden
              />
              {hint ? <div className="hint">{hint}</div> : null}
            </div>
          </div>

          <div className={`results-section ${searchActive ? "is-searching" : ""} capture-bottom`}>
            {searchActive ? (
              <div className="search-banner">
                <div>
                  <h2>检索结果</h2>
                  <p>这是你刚刚找过的那一段。</p>
                </div>
                <div className="search-badge">检索中</div>
              </div>
            ) : (
              <>
                <h2>这些时刻</h2>
                <p>这里收着你最近走过的样子。</p>
              </>
            )}
            {searchActive && (searchKeyword || searchStart || searchEnd) ? (
              <div className="search-summary">
                <span>{searchKeyword ? `关键词：${searchKeyword}` : "关键词：无"}</span>
                {searchStart || searchEnd ? (
                  <span>时间：{searchStart || "起点"} ~ {searchEnd || "现在"}</span>
                ) : null}
                {timeRangeLabel ? <span>范围：{timeRangeLabel}</span> : null}
              </div>
            ) : null}
            <div
              className={`cards ${
                displayRecords.length === 0 && !searchActive ? "cards-empty" : ""
              }`}
            >
              {displayRecords.length === 0 && !searchActive ? (
                <div className="empty-state">空空如也～</div>
              ) : null}
              {displayRecords.map((record) => (
                <div key={record.id} className="card">
                  <div className="meta">
                    <span>{formatTime(record.createdAt)}</span>
                    <span className="tag">{record.mood || "当下"}</span>
                  </div>
                  <div className="content">{formatContent(record.content)}</div>
                  {((record.images?.length ?? 0) > 0 ||
                    (record.videos?.length ?? 0) > 0) && (
                    <div className="card-media">
                      {record.images?.map((url, idx) => (
                        <button
                          key={`${record.id}-img-${idx}`}
                          className="card-media-btn"
                          type="button"
                          onClick={() =>
                            setPreviewItem({
                              url,
                              type: "image",
                            })
                          }
                        >
                          <img src={url} alt="图片" />
                        </button>
                      ))}
                      {record.videos?.map((url, idx) => (
                        <button
                          key={`${record.id}-vid-${idx}`}
                          className="card-media-btn"
                          type="button"
                          onClick={() =>
                            setPreviewItem({
                              url,
                              type: "video",
                            })
                          }
                        >
                          <video src={url} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="card-actions">
                    <button
                      className="text-btn"
                      type="button"
                      onClick={() => handleCopy(record.content)}
                    >
                      复制
                    </button>
                    <button
                      className="text-btn"
                      type="button"
                      onClick={() => handleDownload(record)}
                    >
                      下载
                    </button>
                    <button
                      className="text-btn"
                      type="button"
                      onClick={() => setDeleteTarget(record.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {searchActive && displayRecords.length === 0 ? (
              <div className="hint">没有找到对应的时刻。</div>
            ) : null}
          </div>
        </section>

        <aside className="panel side">
          <div className="recall">
            <h2>被动回顾</h2>
            <p>在你平静的时候，轻轻出现一条过去的你。</p>
            {records.length === 0 ? (
              <div className="recall-item">
                <div className="content">现在还没有可回放的时刻。</div>
              </div>
            ) : (
              <div className="recall-item">
                <div className="meta">
                  <span>{formatTime(recallItem.createdAt)}</span>
                  <span className="tag">{recallItem.mood || "当下"}</span>
                </div>
                <div className="content">{formatContent(recallItem.content)}</div>
              </div>
            )}
            <div className="recall-actions">
              <button
                className="ghost-btn"
                type="button"
                onClick={() => {
                  if (records.length === 0) return;
                  setRecallIndex((prev) => (prev + 1) % records.length);
                }}
              >
                再遇见一条
              </button>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={autoRecall}
                  onChange={(event) => setAutoRecall(event.target.checked)}
                />
                <span className="toggle-track" />
                <span>自动轮换</span>
              </label>
            </div>
          </div>

          <div className="timeline" style={{ marginTop: 18 }}>
            <h2>粗时间视角</h2>
            <p>按时间段回看，不做分析。</p>
            <div className="timeline-row">
              <button
                className="timeline-btn"
                type="button"
                onClick={() => applyTimeRange(7, "最近 7 天")}
              >
                最近 7 天
              </button>
              <span>{timeStats.last7} 条</span>
            </div>
            <div className="timeline-row">
              <button
                className="timeline-btn"
                type="button"
                onClick={() => applyTimeRange(30, "最近 30 天")}
              >
                最近 30 天
              </button>
              <span>{timeStats.last30} 条</span>
            </div>
            <div className="timeline-row">
              <button
                className="timeline-btn"
                type="button"
                onClick={() => applyTimeRange(90, "最近 90 天")}
              >
                最近 90 天
              </button>
              <span>{timeStats.last90} 条</span>
            </div>
          </div>

          <div className="soft-note" style={{ marginTop: 18 }}>
            轻量自我观察提示：你最近更常写下“边界”与“被理解”。
          </div>

          <div className="search" style={{ marginTop: 18 }}>
            <h2>基础检索</h2>
            <div className="search-row">
              <input
                type="text"
                placeholder="关键词"
                value={searchKeyword}
                onChange={(event) => setSearchKeyword(event.target.value)}
              />
              <input
                type="date"
                placeholder="开始日期"
                value={searchStart}
                onChange={(event) => setSearchStart(event.target.value)}
              />
              <input
                type="date"
                placeholder="结束日期"
                value={searchEnd}
                onChange={(event) => setSearchEnd(event.target.value)}
              />
            </div>
            <div className="search-actions">
              <button
                className="ghost-btn"
                type="button"
                onClick={() => {
                  setSearchActive(true);
                  if (!hasSearchCriteria) {
                    showHint("写下一个关键词，或选一个时间段。");
                  } else {
                    performSearch();
                  }
                }}
              >
                搜索
              </button>
              <button
                className="text-btn"
                type="button"
                onClick={() => {
                  setSearchActive(false);
                  setSearchKeyword("");
                  setSearchStart("");
                  setSearchEnd("");
                  setTimeRangeLabel("");
                  setSearchResults([]);
                }}
              >
                清空检索
              </button>
            </div>
          </div>
        </aside>
      </main>

      <footer>人生哪能多如意，万事只求半称心。</footer>
      {deleteTarget ? (
        <div className="dialog-overlay" role="dialog" aria-modal="true">
          <div className="dialog-card">
            <div className="dialog-title">要删除这一条吗？</div>
            <div className="dialog-actions">
              <button
                className="ghost-btn"
                type="button"
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>
              <button
                className="primary-btn"
                type="button"
                onClick={async () => {
                  const id = deleteTarget;
                  setDeleteTarget(null);
                  if (id) {
                    await handleDelete(id);
                  }
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {previewItem ? (
        <div
          className="preview-overlay"
          role="button"
          tabIndex={0}
          onClick={() => setPreviewItem(null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setPreviewItem(null);
          }}
        >
          <div className="preview-card" onClick={(event) => event.stopPropagation()}>
            {previewItem.type === "image" ? (
              <img src={previewItem.url} alt="预览" />
            ) : (
              <video src={previewItem.url} controls />
            )}
            <button
              className="preview-close"
              type="button"
              onClick={() => setPreviewItem(null)}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
