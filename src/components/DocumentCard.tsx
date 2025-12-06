import { FileText, FileSpreadsheet, FileImage, File, Download, ExternalLink } from "lucide-react";

interface DocumentCardProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  isOwnMessage?: boolean;
}

// File type configurations
const FILE_CONFIGS: { [key: string]: { icon: React.ElementType; color: string; bgColor: string; label: string } } = {
  // PDF
  'application/pdf': {
    icon: FileText,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    label: 'PDF'
  },
  // Word Documents
  'application/msword': {
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-600/10',
    label: 'DOC'
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-600/10',
    label: 'DOCX'
  },
  // Excel
  'application/vnd.ms-excel': {
    icon: FileSpreadsheet,
    color: 'text-green-600',
    bgColor: 'bg-green-600/10',
    label: 'XLS'
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    icon: FileSpreadsheet,
    color: 'text-green-600',
    bgColor: 'bg-green-600/10',
    label: 'XLSX'
  },
  // PowerPoint
  'application/vnd.ms-powerpoint': {
    icon: FileImage,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    label: 'PPT'
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    icon: FileImage,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    label: 'PPTX'
  },
  // Text files
  'text/plain': {
    icon: FileText,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
    label: 'TXT'
  },
  // CSV
  'text/csv': {
    icon: FileSpreadsheet,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'CSV'
  },
  // ZIP/Archive
  'application/zip': {
    icon: File,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-600/10',
    label: 'ZIP'
  },
  'application/x-rar-compressed': {
    icon: File,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    label: 'RAR'
  },
  // JSON
  'application/json': {
    icon: FileText,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    label: 'JSON'
  },
  // XML
  'application/xml': {
    icon: FileText,
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    label: 'XML'
  },
  'text/xml': {
    icon: FileText,
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    label: 'XML'
  },
};

// Get file extension from filename
const getFileExtension = (fileName: string): string => {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
};

// Get config based on file type or extension
const getFileConfig = (fileType: string, fileName: string) => {
  // Check by MIME type first
  if (FILE_CONFIGS[fileType]) {
    return FILE_CONFIGS[fileType];
  }

  // Fallback to extension-based detection
  const ext = getFileExtension(fileName).toLowerCase();
  
  const extensionMap: { [key: string]: typeof FILE_CONFIGS[string] } = {
    'pdf': FILE_CONFIGS['application/pdf'],
    'doc': FILE_CONFIGS['application/msword'],
    'docx': FILE_CONFIGS['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'xls': FILE_CONFIGS['application/vnd.ms-excel'],
    'xlsx': FILE_CONFIGS['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    'ppt': FILE_CONFIGS['application/vnd.ms-powerpoint'],
    'pptx': FILE_CONFIGS['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    'txt': FILE_CONFIGS['text/plain'],
    'csv': FILE_CONFIGS['text/csv'],
    'zip': FILE_CONFIGS['application/zip'],
    'rar': FILE_CONFIGS['application/x-rar-compressed'],
    'json': FILE_CONFIGS['application/json'],
    'xml': FILE_CONFIGS['application/xml'],
  };

  if (extensionMap[ext]) {
    return extensionMap[ext];
  }

  // Default config
  return {
    icon: File,
    color: 'text-gray-400',
    bgColor: 'bg-gray-400/10',
    label: ext || 'FILE'
  };
};

// Format file size (if available in future)
const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Truncate filename if too long
const truncateFileName = (name: string, maxLength: number = 25): string => {
  if (name.length <= maxLength) return name;
  
  const ext = getFileExtension(name);
  const nameWithoutExt = name.slice(0, name.lastIndexOf('.'));
  const truncatedName = nameWithoutExt.slice(0, maxLength - ext.length - 4) + '...';
  
  return ext ? `${truncatedName}.${ext.toLowerCase()}` : truncatedName;
};

export function DocumentCard({ fileUrl, fileName, fileType, isOwnMessage = false }: DocumentCardProps) {
  const config = getFileConfig(fileType, fileName);
  const IconComponent = config.icon;
  const displayName = truncateFileName(fileName);

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 p-3 rounded-xl mb-2 transition-all hover:scale-[1.02] ${
        isOwnMessage 
          ? 'bg-white/10 hover:bg-white/20' 
          : 'bg-secondary hover:bg-secondary/80'
      }`}
      style={{ minWidth: '220px', maxWidth: '280px' }}
    >
      {/* File Icon */}
      <div className={`flex-shrink-0 w-12 h-12 rounded-lg ${config.bgColor} flex items-center justify-center`}>
        <IconComponent className={`h-6 w-6 ${config.color}`} />
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isOwnMessage ? 'text-white' : 'text-foreground'}`}>
          {displayName}
        </p>
        <p className={`text-xs ${isOwnMessage ? 'text-blue-100' : 'text-muted-foreground'}`}>
          {config.label} Document
        </p>
      </div>

      {/* Download/Open Icon */}
      <div className={`flex-shrink-0 ${isOwnMessage ? 'text-blue-100' : 'text-muted-foreground'}`}>
        <ExternalLink className="h-4 w-4" />
      </div>
    </a>
  );
}

// Video card component
export function VideoCard({ fileUrl, fileName, isOwnMessage = false }: { fileUrl: string; fileName: string; isOwnMessage?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden mb-2 max-w-[280px]">
      <video
        src={fileUrl}
        controls
        className="w-full max-h-[200px] object-cover"
        preload="metadata"
      />
      <div className={`px-3 py-2 ${isOwnMessage ? 'bg-white/10' : 'bg-secondary'}`}>
        <p className={`text-xs truncate ${isOwnMessage ? 'text-blue-100' : 'text-muted-foreground'}`}>
          {truncateFileName(fileName, 30)}
        </p>
      </div>
    </div>
  );
}

// Audio card component
export function AudioCard({ fileUrl, fileName, isOwnMessage = false }: { fileUrl: string; fileName: string; isOwnMessage?: boolean }) {
  return (
    <div className={`rounded-xl overflow-hidden mb-2 p-3 ${isOwnMessage ? 'bg-white/10' : 'bg-secondary'}`} style={{ minWidth: '220px', maxWidth: '280px' }}>
      <audio src={fileUrl} controls className="w-full h-10" preload="metadata" />
      <p className={`text-xs truncate mt-2 ${isOwnMessage ? 'text-blue-100' : 'text-muted-foreground'}`}>
        {truncateFileName(fileName, 30)}
      </p>
    </div>
  );
}
