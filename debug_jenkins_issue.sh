#!/bin/bash

echo "=== Jenkins vs IDEA 打包差异诊断 ==="

# 1. 检查JDK版本
echo "1. JDK版本检查:"
java -version
echo ""

# 2. 对比jar包内容
echo "2. 对比jar包内容差异:"
if [ -d "/Users/yanlizhi/Downloads/vccjenkins" ] && [ -d "/Users/yanlizhi/Downloads/vcc-admin8" ]; then
    echo "Jenkins包文件数:"
    find /Users/yanlizhi/Downloads/vccjenkins -type f | wc -l
    
    echo "IDEA包文件数:"
    find /Users/yanlizhi/Downloads/vcc-admin8 -type f | wc -l
    
    echo "文件差异:"
    diff -rq /Users/yanlizhi/Downloads/vccjenkins /Users/yanlizhi/Downloads/vcc-admin8 | head -20
else
    echo "未找到解压目录，请确保已解压jar包"
fi

echo ""

# 3. 检查关键配置文件
echo "3. 检查关键配置文件:"
for dir in "/Users/yanlizhi/Downloads/vccjenkins" "/Users/yanlizhi/Downloads/vcc-admin8"; do
    if [ -d "$dir" ]; then
        echo "目录: $dir"
        find $dir -name "*.yml" -o -name "*.yaml" -o -name "*.properties" | head -10
    fi
done

echo ""

# 4. 检查Spring Security相关类
echo "4. 检查Spring Security类:"
for dir in "/Users/yanlizhi/Downloads/vccjenkins" "/Users/yanlizhi/Downloads/vcc-admin8"; do
    if [ -d "$dir" ]; then
        echo "目录: $dir"
        find $dir -name "*Security*.class" -o -name "*Jwt*.class" -o -name "*Auth*.class" | head -10
    fi
done

echo ""

# 5. 检查MANIFEST.MF
echo "5. 检查MANIFEST.MF:"
for dir in "/Users/yanlizhi/Downloads/vccjenkins" "/Users/yanlizhi/Downloads/vcc-admin8"; do
    manifest_file="$dir/META-INF/MANIFEST.MF"
    if [ -f "$manifest_file" ]; then
        echo "=== $dir/META-INF/MANIFEST.MF ==="
        grep -E "(Spring-Boot-|Implementation-|Main-Class)" "$manifest_file"
    fi
done