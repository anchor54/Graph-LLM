-- DropForeignKey
ALTER TABLE "Folder" DROP CONSTRAINT "Folder_parentId_fkey";

-- DropForeignKey
ALTER TABLE "Node" DROP CONSTRAINT "Node_folderId_fkey";

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
